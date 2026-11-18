package com.pitchr.backend;

import java.util.List;
import org.springframework.data.jpa.repository.*;
import java.time.Instant;

interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findTop100BySessionIdOrderByIdDesc(String sessionId);
    long countBySessionIdAndReadAtIsNull(String sessionId);
    @Modifying
    @Query("update Notification n set n.readAt = :now where n.sessionId = :session and n.id <= :through and n.readAt is null")
    void readThrough(String session, long through, Instant now);
}
