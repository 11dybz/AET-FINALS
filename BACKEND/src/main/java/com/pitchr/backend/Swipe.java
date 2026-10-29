package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "swipes", uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "profile_id"}))
public class Swipe {
    public enum Action { pass, like, super_like }
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id") VisitorSession session;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id") Profile profile;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false) Action action;
    @Column(nullable = false) Instant createdAt;
    @Column(nullable = false) Instant updatedAt;
}
