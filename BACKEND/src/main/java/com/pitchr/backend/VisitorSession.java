package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "visitor_sessions")
public class VisitorSession {
    @Id String id;
    @Column(nullable = false) Instant expiresAt;
    protected VisitorSession() {}
    VisitorSession(String id, Instant expiresAt) {
        this.id = id;
        this.expiresAt = expiresAt;
    }
}
