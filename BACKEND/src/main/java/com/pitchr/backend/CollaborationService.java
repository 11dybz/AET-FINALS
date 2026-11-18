package com.pitchr.backend;

import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional
public class CollaborationService {
    private static final List<String> ACTIVE = List.of("ringing", "accepted");
    private final SessionRepository sessions;
    private final SwipeRepository swipes;
    private final ProfileRepository profiles;
    private final VideoCallRepository calls;
    private final CallSignalRepository signals;
    private final NotificationRepository notifications;
    private final JsonMapper json = new JsonMapper();

    CollaborationService(SessionRepository sessions, SwipeRepository swipes, ProfileRepository profiles,
                         VideoCallRepository calls, CallSignalRepository signals, NotificationRepository notifications) {
        this.sessions = sessions; this.swipes = swipes; this.profiles = profiles;
        this.calls = calls; this.signals = signals; this.notifications = notifications;
    }

    void notify(String session, String profile, String kind, String body) {
        Notification n = new Notification(); n.sessionId = session; n.profileId = profile;
        n.kind = kind; n.body = body; n.createdAt = Instant.now(); notifications.save(n);
    }
    void revokeCalls(String session, String profile) { calls.revoke(session, profile); }

    public Map<String, Object> notifications(String token) {
        String session = session(token, false).id;
        var items = notifications.findTop100BySessionIdOrderByIdDesc(session).stream().map(n ->
            new Notice(n.id, n.profileId, n.kind, n.body, n.createdAt, n.readAt)).toList();
        return Map.of("items", items, "unreadCount", notifications.countBySessionIdAndReadAtIsNull(session));
    }

    public void read(String token, long through) {
        notifications.readThrough(session(token, true).id, through, Instant.now());
    }

    public CallView start(String token, String profileId, String offer) {
        var visitor = session(token, true); matched(visitor.id, profileId);
        validateSdp(offer);
        for (VideoCall existing : calls.findBySessionIdAndStateInOrderByCreatedAtDesc(visitor.id, ACTIVE)) {
            expire(existing);
            if (ACTIVE.contains(existing.state)) throw failure(HttpStatus.CONFLICT, "You already have an active call");
        }
        if (calls.countBySessionIdAndCreatedAtAfter(visitor.id, Instant.now().minusSeconds(60)) >= 5)
            throw failure(HttpStatus.TOO_MANY_REQUESTS, "Too many call invitations. Please wait a minute.");
        VideoCall c = new VideoCall(); c.id = UUID.randomUUID().toString(); c.sessionId = visitor.id;
        c.profileId = profileId; c.state = "ringing"; c.offer = offer;
        c.createdAt = c.visitorHeartbeat = c.teamHeartbeat = Instant.now(); calls.save(c);
        return view(c, "visitor");
    }

    public List<CallSummary> active(String token, String profileId, boolean team) {
        if (team && !profiles.existsById(profileId)) throw failure(HttpStatus.NOT_FOUND, "Profile not found");
        var items = team ? calls.findByProfileIdAndStateInOrderByCreatedAtDesc(profileId, ACTIVE)
            : calls.findBySessionIdAndStateInOrderByCreatedAtDesc(session(token, false).id, ACTIVE);
        return items.stream().filter(c -> !expired(c)).limit(100)
            .map(c -> new CallSummary(c.id, c.profileId, c.state, c.createdAt)).toList();
    }

    public CallView get(String token, String id, boolean team) {
        VideoCall c = authorized(token, id, team); expire(c);
        if (ACTIVE.contains(c.state)) {
            if (team) c.teamHeartbeat = Instant.now(); else c.visitorHeartbeat = Instant.now();
        }
        return view(c, team ? "team" : "visitor");
    }

    public CallView action(String token, String id, boolean team, String action, String answer) {
        VideoCall c = authorized(token, id, team); expire(c);
        if (!ACTIVE.contains(c.state)) {
            if ("end".equals(action) || "decline".equals(action)) return view(c, team ? "team" : "visitor");
            throw failure(HttpStatus.CONFLICT, "This call has already ended");
        }
        if ("accept".equals(action)) {
            if (!team) throw failure(HttpStatus.FORBIDDEN, "Only the invited team member can accept");
            if (!"ringing".equals(c.state)) throw failure(HttpStatus.CONFLICT, "Call already answered");
            validateSdp(answer); c.answer = answer; c.state = "accepted"; c.teamHeartbeat = Instant.now();
        } else if ("end".equals(action) || "decline".equals(action)) {
            if ("decline".equals(action) && (!team || !"ringing".equals(c.state)))
                throw failure(HttpStatus.CONFLICT, "Only an incoming invitation can be declined");
            c.state = "decline".equals(action) ? "declined" : "ended";
        } else throw failure(HttpStatus.BAD_REQUEST, "Unknown call action");
        if (team) notify(c.sessionId, c.profileId, "call", "Video call " + c.state + ".");
        return view(c, team ? "team" : "visitor");
    }

    public void candidate(String token, String id, boolean team, String payload) {
        VideoCall c = authorized(token, id, team); expire(c);
        if (!ACTIVE.contains(c.state)) throw failure(HttpStatus.CONFLICT, "Call has ended");
        try {
            var value = json.readTree(payload);
            if (!value.isObject() || !value.has("candidate") || !value.get("candidate").isString()) throw new IllegalArgumentException();
        } catch (Exception e) { throw failure(HttpStatus.BAD_REQUEST, "Invalid ICE candidate"); }
        String sender = team ? "team" : "visitor";
        if (signals.countByCallIdAndSender(id, sender) >= 80) throw failure(HttpStatus.TOO_MANY_REQUESTS, "ICE candidate limit reached");
        CallSignal s = new CallSignal(); s.callId = id; s.sender = sender; s.payload = payload; signals.save(s);
    }

    private VideoCall authorized(String token, String id, boolean team) {
        String visitor = team ? null : session(token, false).id;
        VideoCall c = calls.lock(id).orElseThrow(() -> failure(HttpStatus.NOT_FOUND, "Call not found"));
        if (!team && !c.sessionId.equals(visitor)) throw failure(HttpStatus.NOT_FOUND, "Call not found");
        // Passing a profile revokes access to its call, including team access.
        matched(c.sessionId, c.profileId);
        if (team) session(c.sessionId, false);
        return c;
    }

    private CallView view(VideoCall c, String sender) {
        return new CallView(c.id, c.profileId, c.state, c.offer, c.answer, c.createdAt,
            signals.findByCallIdAndSenderNotOrderByIdAsc(c.id, sender).stream().map(s -> new Signal(s.id, s.payload)).toList());
    }
    private boolean expired(VideoCall c) {
        Instant now = Instant.now();
        return ("ringing".equals(c.state) && c.createdAt.isBefore(now.minusSeconds(90)))
            || ("accepted".equals(c.state) && (c.visitorHeartbeat.isBefore(now.minusSeconds(60))
                || c.teamHeartbeat.isBefore(now.minusSeconds(60))))
            || c.createdAt.isBefore(now.minusSeconds(3600));
    }
    private void expire(VideoCall c) { if (ACTIVE.contains(c.state) && expired(c)) c.state = "ended"; }
    private void validateSdp(String sdp) {
        if (sdp == null || sdp.length() > 16000 || !sdp.startsWith("v=0")) throw failure(HttpStatus.BAD_REQUEST, "Invalid session description");
    }
    private VisitorSession session(String token, boolean lock) {
        if (token == null || token.isBlank()) throw failure(HttpStatus.UNAUTHORIZED, "Create or resume a visitor session first");
        return (lock ? sessions.findForUpdate(token) : sessions.findById(token))
            .map(s -> (VisitorSession) org.hibernate.Hibernate.unproxy(s))
            .filter(s -> s.expiresAt.isAfter(Instant.now())).orElseThrow(() -> failure(HttpStatus.UNAUTHORIZED, "Session expired"));
    }
    private void matched(String session, String profile) {
        if (swipes.findBySessionIdAndProfileId(session, profile).filter(s -> s.action != Swipe.Action.pass).isEmpty())
            throw failure(HttpStatus.FORBIDDEN, "Match this profile before calling");
    }
    private ResponseStatusException failure(HttpStatus status, String reason) { return new ResponseStatusException(status, reason); }
    public record Notice(long id, String profileId, String kind, String body, Instant createdAt, Instant readAt) {}
    public record Signal(long id, String payload) {}
    public record CallSummary(String id, String profileId, String state, Instant createdAt) {}
    public record CallView(String id, String profileId, String state, String offer, String answer, Instant createdAt, List<Signal> signals) {}
}
