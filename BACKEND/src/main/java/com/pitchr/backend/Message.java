package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "messages")
public class Message {
    public enum Sender { visitor, member }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id") VisitorSession session;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id") Profile profile;
    @Enumerated(EnumType.STRING) @Column(nullable = false) Sender sender;
    @Column(nullable = false, length = 1000) String body;
    @Column(nullable = false) Instant createdAt;
    Instant readAt;
}
