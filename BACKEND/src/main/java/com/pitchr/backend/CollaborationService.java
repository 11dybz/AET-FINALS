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
    private final AccountService accounts;
    private final ConnectionService connections;
    private final CallHistoryService history;
    private final JsonMapper json = new JsonMapper();

    CollaborationService(SessionRepository sessions, SwipeRepository swipes, ProfileRepository profiles,
                         VideoCallRepository calls, CallSignalRepository signals, NotificationRepository notifications, AccountService accounts,
                         ConnectionService connections, CallHistoryService history) {
        this.sessions = sessions; this.swipes = swipes; this.profiles = profiles;
        this.calls = calls; this.signals = signals; this.notifications = notifications;
        this.accounts = accounts;
        this.connections = connections;
        this.history = history;
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
        connections.threadForWrite(token,profileId);
        var visitor = session(token, false); matched(visitor.id, profileId);
        validateSdp(offer);
        Set<String> busyIds=new TreeSet<>(calls.activeIds(visitor.id,null));
        for (String participant : List.of(accounts.profileIdForWorkspace(visitor.id),profileId)) {
            String workspace=connections.workspaceForProfile(participant);
            busyIds.addAll(calls.activeIds(workspace,participant));
        }
        for (String id : busyIds) {
            VideoCall existing=calls.lock(id).orElseThrow(); history.refresh(existing);
            if (ACTIVE.contains(existing.state)) throw failure(HttpStatus.CONFLICT,"One of you already has an active call. Please try again shortly.");
        }
        if (calls.countBySessionIdAndCreatedAtAfter(visitor.id, Instant.now().minusSeconds(60)) >= 5)
            throw failure(HttpStatus.TOO_MANY_REQUESTS, "Too many call invitations. Please wait a minute.");
        VideoCall c = new VideoCall(); c.id = UUID.randomUUID().toString(); c.sessionId = visitor.id;
        c.profileId = profileId; c.state = "ringing"; c.offer = offer;
        c.createdAt = c.visitorHeartbeat = c.teamHeartbeat = Instant.now(); calls.save(c);
        connections.notifyProfile(profileId,accounts.profileIdForWorkspace(visitor.id),"call","Incoming video call.");
        return view(c, "visitor");
    }

    public List<CallSummary> active(String token, String profileId, boolean team) {
        if (!team) accounts.requireAccount(token);
        if (team && !profiles.existsById(profileId)) throw failure(HttpStatus.NOT_FOUND, "Profile not found");
        String workspace=team ? null : session(token,false).id;
        String own=team ? null : accounts.profileIdForWorkspace(workspace);
        List<VideoCall> items=new ArrayList<>();
        for (String id : calls.activeIds(workspace,team ? profileId : own)) calls.lock(id).ifPresent(c -> { history.refresh(c); items.add(c); });
        return items.stream().filter(c -> ACTIVE.contains(c.state))
            .filter(c -> isMatched(c.sessionId,c.profileId)).distinct().limit(100)
            .map(c -> new CallSummary(c.id, !team && c.profileId.equals(own) ? accounts.profileIdForWorkspace(c.sessionId) : c.profileId,
                c.state, c.createdAt,!team && c.profileId.equals(own))).toList();
    }

    public CallView get(String token, String id, boolean team) {
        Access access=authorized(token,id,team); VideoCall c=access.call(); team=access.receiver(); expire(c);
        if (ACTIVE.contains(c.state)) {
            if (team) c.teamHeartbeat = Instant.now(); else c.visitorHeartbeat = Instant.now();
        }
        return view(c, team ? "team" : "visitor");
    }

    public CallView action(String token, String id, boolean team, String action, String answer) {
        Access access=authorized(token,id,team); VideoCall c=access.call(); team=access.receiver(); expire(c);
        if (!ACTIVE.contains(c.state)) {
            if ("end".equals(action) || "decline".equals(action)) return view(c, team ? "team" : "visitor");
            throw failure(HttpStatus.CONFLICT, "This call has already ended");
        }
        if ("accept".equals(action)) {
            if (!team) throw failure(HttpStatus.FORBIDDEN, "Only the invited team member can accept");
            if (!"ringing".equals(c.state)) throw failure(HttpStatus.CONFLICT, "Call already answered");
            validateSdp(answer); c.answer = answer; c.state = "accepted"; c.teamHeartbeat = c.acceptedAt = Instant.now();
        } else if ("end".equals(action) || "decline".equals(action)) {
            if ("decline".equals(action) && (!team || !"ringing".equals(c.state)))
                throw failure(HttpStatus.CONFLICT, "Only an incoming invitation can be declined");
            c.state = "decline".equals(action) ? "declined" : "ended";
            c.endedAt=Instant.now(); history.record(c);
        } else throw failure(HttpStatus.BAD_REQUEST, "Unknown call action");
        if (team) notify(c.sessionId, c.profileId, "call", "Video call " + c.state + ".");
        return view(c, team ? "team" : "visitor");
    }

    public void candidate(String token, String id, boolean team, String payload) {
        Access access=authorized(token,id,team); VideoCall c=access.call(); team=access.receiver(); expire(c);
        if (!ACTIVE.contains(c.state)) throw failure(HttpStatus.CONFLICT, "Call has ended");
        try {
            var value = json.readTree(payload);
            if (!value.isObject() || !value.has("candidate") || !value.get("candidate").isString()) throw new IllegalArgumentException();
        } catch (Exception e) { throw failure(HttpStatus.BAD_REQUEST, "Invalid ICE candidate"); }
        String sender = team ? "team" : "visitor";
        if (signals.countByCallIdAndSender(id, sender) >= 80) throw failure(HttpStatus.TOO_MANY_REQUESTS, "ICE candidate limit reached");
        CallSignal s = new CallSignal(); s.callId = id; s.sender = sender; s.payload = payload; signals.save(s);
    }

    private Access authorized(String token, String id, boolean team) {
        String visitor = team ? null : session(token, false).id;
        VideoCall c = calls.lock(id).orElseThrow(() -> failure(HttpStatus.NOT_FOUND, "Call not found"));
        boolean receiver=team || c.profileId.equals(accounts.profileIdForWorkspace(visitor));
        if (!team && !c.sessionId.equals(visitor) && !receiver) throw failure(HttpStatus.NOT_FOUND, "Call not found");
        // Passing a profile revokes access to its call, including team access.
        matched(c.sessionId, c.profileId);
        return new Access(c,receiver);
    }

    private CallView view(VideoCall c, String sender) {
        return new CallView(c.id, c.profileId, c.state, c.offer, c.answer, c.createdAt,
            signals.findByCallIdAndSenderNotOrderByIdAsc(c.id, sender).stream().map(s -> new Signal(s.id, s.payload)).toList());
    }
    private void expire(VideoCall c) { history.refresh(c); }
    private void validateSdp(String sdp) {
        if (sdp == null || sdp.length() > 16000 || !sdp.startsWith("v=0")) throw failure(HttpStatus.BAD_REQUEST, "Invalid session description");
    }
    private VisitorSession session(String token, boolean lock) {
        if (token == null || token.isBlank()) throw failure(HttpStatus.UNAUTHORIZED, "Create or resume a visitor session first");
        return accounts.resolve(token, lock).orElseThrow(() -> failure(HttpStatus.UNAUTHORIZED, "Session expired"));
    }
    private void matched(String session, String profile) {
        if (accounts.ownsWorkspaceProfile(session, profile))
            throw failure(HttpStatus.FORBIDDEN, "You cannot call your own profile.");
        connections.acceptedBetween(accounts.profileIdForWorkspace(session),profile);
    }
    private boolean isMatched(String session,String profile) {
        try { matched(session,profile); return true; } catch (ResponseStatusException ignored) { return false; }
    }
    private ResponseStatusException failure(HttpStatus status, String reason) { return new ResponseStatusException(status, reason); }
    public record Notice(long id, String profileId, String kind, String body, Instant createdAt, Instant readAt) {}
    public record Signal(long id, String payload) {}
    private record Access(VideoCall call,boolean receiver) {}
    public record CallSummary(String id, String profileId, String state, Instant createdAt, boolean incoming) {}
    public record CallView(String id, String profileId, String state, String offer, String answer, Instant createdAt, List<Signal> signals) {}
}
