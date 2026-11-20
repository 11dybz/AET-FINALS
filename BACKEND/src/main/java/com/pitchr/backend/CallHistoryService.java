package com.pitchr.backend;

import java.time.Duration;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
class CallHistoryService {
    private final VideoCallRepository calls;
    private final MessageRepository messages;
    private final ConnectionRepository connections;
    private final AccountRepository accounts;
    private final SessionRepository sessions;
    private final ProfileRepository profiles;
    private final NotificationRepository notices;

    CallHistoryService(VideoCallRepository calls, MessageRepository messages, ConnectionRepository connections,
                       AccountRepository accounts, SessionRepository sessions, ProfileRepository profiles, NotificationRepository notices) {
        this.calls=calls; this.messages=messages; this.connections=connections;
        this.accounts=accounts; this.sessions=sessions; this.profiles=profiles; this.notices=notices;
    }

    // Callers hold the call row lock. The event and final state commit together.
    void refresh(VideoCall call) {
        Instant now=Instant.now();
        if ("ringing".equals(call.state) && call.createdAt.isBefore(now.minusSeconds(90))) {
            call.state="missed"; call.endedAt=call.createdAt.plusSeconds(90);
        } else if (("accepted".equals(call.state) && (call.visitorHeartbeat.isBefore(now.minusSeconds(60))
            || call.teamHeartbeat.isBefore(now.minusSeconds(60)))) || call.createdAt.isBefore(now.minusSeconds(3600))) {
            if ("ringing".equals(call.state) || "accepted".equals(call.state)) {
                call.state="ended";
                call.endedAt=call.acceptedAt == null ? now : java.util.Collections.min(java.util.List.of(
                    now, call.visitorHeartbeat.plusSeconds(60), call.teamHeartbeat.plusSeconds(60), call.createdAt.plusSeconds(3600)));
            }
        }
        if (!"ringing".equals(call.state) && !"accepted".equals(call.state)) record(call);
    }

    void record(VideoCall call) {
        if (call.historyRecorded) return;
        call.endedAt=call.endedAt == null ? Instant.now() : call.endedAt;
        String caller=accounts.findByWorkspaceId(call.sessionId).map(a -> a.profileId).orElse(null);
        if (caller == null) { call.historyRecorded=true; return; }
        String low=caller.compareTo(call.profileId)<0 ? caller : call.profileId;
        String high=caller.compareTo(call.profileId)<0 ? call.profileId : caller;
        var relationship=connections.findByLowProfileIdAndHighProfileId(low,high);
        if (relationship.isEmpty()) { call.historyRecorded=true; return; }
        Connection thread=relationship.get();
        Message event=new Message();
        event.session=sessions.getReferenceById(thread.threadSessionId);
        event.profile=profiles.getReferenceById(thread.threadProfileId);
        event.sender=caller.equals(thread.threadProfileId) ? Message.Sender.member : Message.Sender.visitor;
        event.callId=call.id;
        event.callState="declined".equals(call.state) ? "declined" : call.acceptedAt == null ? "missed" : "ended";
        event.callDurationSeconds=call.acceptedAt == null ? null : Math.max(0,Duration.between(call.acceptedAt,call.endedAt).getSeconds());
        event.body=switch (event.callState) { case "missed" -> "Missed call"; case "declined" -> "Call declined"; default -> "Call ended"; };
        event.createdAt=call.endedAt;
        messages.save(event); call.historyRecorded=true;
        // The original invitation is no longer actionable after a final result.
        accounts.findByProfileId(call.profileId).ifPresent(receiver -> {
            notices.readKind(receiver.workspaceId,caller,"call",Instant.now());
            Notification notice=new Notification(); notice.sessionId=receiver.workspaceId; notice.profileId=caller;
            notice.kind="call"; notice.body=event.body; notice.createdAt=event.createdAt; notices.save(notice);
        });
    }

    @Scheduled(fixedDelayString="${rizzume.calls.sweep-delay-ms:5000}")
    public void sweep() {
        Instant now=Instant.now();
        for (String id : calls.unfinishedIds(now.minusSeconds(90),now.minusSeconds(60),now.minusSeconds(3600)))
            calls.lock(id).ifPresent(this::refresh);
    }
}
