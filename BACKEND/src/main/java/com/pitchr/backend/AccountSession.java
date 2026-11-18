package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "account_sessions")
class AccountSession {
    // SHA-256 of the random cookie token; the usable token is never stored in the database.
    @Id @Column(length = 64) String id;
    @Column(nullable = false) String accountId;
    @Column(nullable = false) Instant createdAt;
    @Column(nullable = false) Instant expiresAt;
}
