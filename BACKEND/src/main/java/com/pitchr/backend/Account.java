package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "accounts")
class Account {
    @Id String id;
    @Column(nullable = false, length = 100) String displayName;
    @Column(nullable = false, unique = true, length = 254) String email;
    @Column(nullable = false) String passwordHash;
    @Column(nullable = false, unique = true) String workspaceId;
    @Column(unique = true) String profileId;
    @Column(nullable = false) Instant createdAt;
}
