package com.pitchr.backend;

import java.time.Instant;

public record MessageResponse(Long id, String sender, String body, Instant createdAt, Instant readAt, Location location, CallEvent call) {
    static MessageResponse from(Message m) {
        return from(m, Message.Sender.visitor);
    }
    static MessageResponse from(Message m, Message.Sender ownSide) {
        return new MessageResponse(m.id,m.sender == ownSide ? "visitor" : "member",m.body,m.createdAt,m.readAt, location(m),
            m.callId == null ? null : new CallEvent(m.callState, m.callDurationSeconds));
    }
    private static Location location(Message m) {
        if (m.locationExpiresAt == null) return null;
        Instant now = Instant.now();
        String state = m.locationStoppedAt != null ? "stopped" : !m.locationExpiresAt.isAfter(now) ? "expired" : "active";
        boolean active = state.equals("active");
        return new Location(state, active ? m.locationLat : null, active ? m.locationLon : null,
            active ? m.locationName : null, m.locationExpiresAt, now);
    }
    public record Location(String state, Double latitude, Double longitude, String name, Instant expiresAt, Instant serverNow) {}
    public record CallEvent(String state, Long durationSeconds) {}
}
