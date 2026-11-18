package com.pitchr.backend;

import jakarta.persistence.*;

@Entity
@Table(name = "call_signals")
class CallSignal {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(nullable = false) String callId;
    @Column(nullable = false, length = 16) String sender;
    @Column(nullable = false, length = 4000) String payload;
}
