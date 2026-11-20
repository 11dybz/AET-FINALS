package com.pitchr.backend;

import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
class ConnectionService {
    private final ConnectionRepository connections;
    private final ProfileRepository profiles;
    private final ProfileImageRepository images;
    private final AccountService accounts;
    private final AccountRepository owners;
    private final NotificationRepository notices;
    private final VideoCallRepository calls;

    ConnectionService(ConnectionRepository connections, ProfileRepository profiles, ProfileImageRepository images,
        AccountService accounts, AccountRepository owners, NotificationRepository notices, VideoCallRepository calls) {
        this.connections=connections; this.profiles=profiles; this.images=images; this.accounts=accounts;
        this.owners=owners; this.notices=notices; this.calls=calls;
    }

    public List<View> list(String token) {
        Account account=accounts.requireAccount(token);
        if (account.profileId == null) return List.of();
        return connections.forProfile(account.profileId).stream().map(c -> view(c,account.profileId)).toList();
    }

    public View relationship(String token, String target) {
        Account account=owner(token); different(account.profileId,target);
        return pair(account.profileId,target).map(c -> view(c,account.profileId)).orElse(null);
    }

    @Transactional
    public View request(String token, String target, boolean priority) {
        Account account=owner(token); String own=account.profileId; different(own,target); lockPair(own,target);
        Connection c=pair(own,target).orElse(null);
        if (c != null && (c.status.equals("pending") || c.status.equals("accepted"))) return view(c,own);
        if (c != null && c.updatedAt.isAfter(Instant.now().minusSeconds(60)))
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Please wait a minute before sending another request to this person.");
        if (connections.forProfile(own).stream().filter(r -> r.requesterProfileId.equals(own)
            && r.updatedAt.isAfter(Instant.now().minusSeconds(60))).count() >= 20)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Too many connection requests. Please wait a minute.");
        if (c == null) {
            c=new Connection(); c.id=UUID.randomUUID().toString(); c.lowProfileId=low(own,target); c.highProfileId=high(own,target);
            c.threadSessionId=account.workspaceId; c.threadProfileId=target; c.createdAt=Instant.now();
        }
        c.requesterProfileId=own; c.recipientProfileId=target; c.status="pending"; c.priority=priority; c.updatedAt=Instant.now();
        connections.save(c);
        notifyProfile(target,own,"request",name(own)+" sent you "+(priority ? "a priority" : "a connection")+" request.");
        return view(c,own);
    }

    @Transactional
    public View action(String token, String target, String action) {
        Account account=owner(token); String own=account.profileId; different(own,target); lockPair(own,target);
        Connection c=pair(own,target).orElseThrow(() -> error(HttpStatus.NOT_FOUND,"Connection request not found."));
        if (action == null || !Set.of("accept","decline","cancel","remove").contains(action))
            throw error(HttpStatus.BAD_REQUEST,"Choose accept, decline, cancel, or remove.");
        boolean recipient=c.recipientProfileId.equals(own);
        if ((action.equals("accept") || action.equals("decline")) && !recipient
            || action.equals("cancel") && recipient)
            throw error(HttpStatus.FORBIDDEN,"You cannot perform this action on someone else's request.");
        String next=switch (action) { case "accept" -> "accepted"; case "decline" -> "declined"; case "cancel" -> "cancelled"; default -> "removed"; };
        if (c.status.equals(next)) return view(c,own);
        if (!(action.equals("remove") ? c.status.equals("accepted") : c.status.equals("pending")))
            throw error(HttpStatus.CONFLICT,"This request has changed. Refresh your connections and try again.");
        c.status=next; c.updatedAt=Instant.now();
        for (String participant : List.of(own,target)) {
            String workspace=workspaceForProfile(participant);
            if (workspace == null) continue;
            notices.readKind(workspace,c.other(participant),"request",Instant.now());
            if (next.equals("removed")) {
                notices.readKind(workspace,c.other(participant),"message",Instant.now());
                notices.readKind(workspace,c.other(participant),"match",Instant.now());
            }
        }
        if (next.equals("accepted")) {
            notifyProfile(own,target,"match","You are now connected with "+name(target)+". Say hello!");
            notifyProfile(target,own,"match",name(own)+" accepted your connection request.");
        } else {
            calls.revoke(c.threadSessionId,c.threadProfileId);
            for (String participant : List.of(own,target)) {
                String workspace=workspaceForProfile(participant);
                if (workspace != null) calls.revoke(workspace,c.other(participant));
            }
            String body=switch (action) {
                case "decline" -> name(own)+" declined your connection request.";
                case "cancel" -> name(own)+" cancelled their connection request.";
                default -> name(own)+" removed the connection. Messaging and calls are now closed.";
            };
            notifyProfile(target,own,"request",body);
        }
        return view(c,own);
    }

    public Thread thread(String token, String target) {
        Account account=owner(token);
        if (account.profileId.equals(target)) throw error(HttpStatus.FORBIDDEN,"You cannot message or call your own profile.");
        Connection c=acceptedBetween(account.profileId,target);
        return new Thread(c.threadSessionId,c.threadProfileId,
            account.profileId.equals(c.threadProfileId) ? Message.Sender.member : Message.Sender.visitor);
    }
    @Transactional
    public Thread threadForWrite(String token,String target) {
        Account account=owner(token);
        if (account.profileId.equals(target)) throw error(HttpStatus.FORBIDDEN,"You cannot message or call your own profile.");
        lockPair(account.profileId,target);
        return thread(token,target);
    }
    public Connection acceptedBetween(String own,String target) {
        if (own == null || own.equals(target)) throw error(HttpStatus.FORBIDDEN,"An accepted connection is required.");
        return pair(own,target).filter(r -> r.status.equals("accepted"))
            .orElseThrow(() -> error(HttpStatus.FORBIDDEN,"Accept a connection request before messaging or calling."));
    }

    public Connection acceptedThread(String session, String profile) {
        return connections.findByThreadSessionIdAndThreadProfileId(session,profile).filter(c -> c.status.equals("accepted"))
            .orElseThrow(() -> error(HttpStatus.FORBIDDEN,"An accepted connection is required."));
    }

    public List<Connection> acceptedThreads() { return connections.findByStatusOrderByUpdatedAtDesc("accepted"); }
    public String workspaceForProfile(String profile) { return owners.findByProfileId(profile).map(a -> a.workspaceId).orElse(null); }
    public void notifyProfile(String recipient, String other, String kind, String body) {
        String workspace=workspaceForProfile(recipient); if (workspace == null) return;
        Notification n=new Notification(); n.sessionId=workspace; n.profileId=other; n.kind=kind; n.body=body;
        n.createdAt=Instant.now(); notices.save(n);
    }
    public void readMessageNotices(String recipient,String other) {
        String workspace=workspaceForProfile(recipient);
        if (workspace != null) notices.readKind(workspace,other,"message",Instant.now());
    }
    private Account owner(String token) {
        Account account=accounts.requireAccount(token);
        if (account.profileId == null) throw error(HttpStatus.CONFLICT,"Create your profile before sending or accepting connection requests.");
        return account;
    }
    private void different(String own, String target) {
        if (own.equals(target)) throw error(HttpStatus.BAD_REQUEST,"You cannot match with your own profile.");
    }
    private void lockPair(String own, String target) {
        // Consistent profile order serializes duplicate and crossed requests, including first inserts.
        for (String id : List.of(low(own,target),high(own,target)))
            profiles.findForUpdate(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND,"Profile not found."));
    }
    private Optional<Connection> pair(String own, String target) { return connections.findByLowProfileIdAndHighProfileId(low(own,target),high(own,target)); }
    private String low(String a,String b) { return a.compareTo(b)<0 ? a : b; }
    private String high(String a,String b) { return a.compareTo(b)<0 ? b : a; }
    private String name(String id) { return profiles.findById(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND,"Profile not found.")).name; }
    private View view(Connection c, String own) {
        String other=c.other(own); Profile p=profiles.findById(other).orElseThrow(() -> error(HttpStatus.NOT_FOUND,"Profile not found."));
        return new View(ProfileResponse.from(p,c.priority,images.findByProfileIdOrderByDisplayOrderAscIdAsc(other)),
            c.status,c.recipientProfileId.equals(own) ? "incoming" : "outgoing",c.priority,c.createdAt,c.updatedAt,
            workspaceForProfile(other) != null);
    }
    private ResponseStatusException error(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
    record View(ProfileResponse profile,String status,String direction,boolean priority,Instant createdAt,Instant updatedAt,boolean ownerAvailable) {}
    record Thread(String sessionId,String profileId,Message.Sender side) {}
}
