package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "video_calls")
class VideoCall {
    @Id String id;
    @Column(nullable = false) String sessionId;
    @Column(nullable = false) String profileId;
    @Column(nullable = false, length = 32) String state;
    @Column(nullable = false, length = 16000) String offer;
    @Column(length = 16000) String answer;
    @Column(nullable = false) Instant createdAt;
    @Column(nullable = false) Instant visitorHeartbeat;
    @Column(nullable = false) Instant teamHeartbeat;
    Instant acceptedAt;
    Instant endedAt;
    @Column(nullable = false) boolean historyRecorded;
}
