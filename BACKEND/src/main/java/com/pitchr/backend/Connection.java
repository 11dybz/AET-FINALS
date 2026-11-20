package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "connections")
class Connection {
    @Id String id;
    @Column(nullable = false) String lowProfileId;
    @Column(nullable = false) String highProfileId;
    @Column(nullable = false) String requesterProfileId;
    @Column(nullable = false) String recipientProfileId;
    @Column(nullable = false) String threadSessionId;
    @Column(nullable = false) String threadProfileId;
    @Column(nullable = false, length = 16) String status;
    @Column(nullable = false) boolean priority;
    @Column(nullable = false) Instant createdAt;
    @Column(nullable = false) Instant updatedAt;

    String other(String profile) { return lowProfileId.equals(profile) ? highProfileId : lowProfileId; }
}
