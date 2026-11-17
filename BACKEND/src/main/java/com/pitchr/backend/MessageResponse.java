package com.pitchr.backend;

import java.time.Instant;

public record MessageResponse(Long id, String sender, String body, Instant createdAt, Instant readAt) {
    static MessageResponse from(Message m) {
        return new MessageResponse(m.id, m.sender.name(), m.body, m.createdAt, m.readAt);
    }
}
