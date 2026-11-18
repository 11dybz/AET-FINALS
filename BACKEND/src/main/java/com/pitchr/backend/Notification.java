package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "notifications")
class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(nullable = false) String sessionId;
    @Column(nullable = false) String profileId;
    @Column(nullable = false, length = 32) String kind;
    @Column(nullable = false, length = 1000) String body;
    @Column(nullable = false) Instant createdAt;
    Instant readAt;
}
