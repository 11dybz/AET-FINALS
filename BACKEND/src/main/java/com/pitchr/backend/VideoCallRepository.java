package com.pitchr.backend;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface VideoCallRepository extends JpaRepository<VideoCall, String> {
    long countBySessionIdAndCreatedAtAfter(String sessionId, java.time.Instant since);
    @Modifying
    @Query("update VideoCall c set c.state = 'ended' where c.sessionId = :session and c.profileId = :profile and c.state in ('ringing', 'accepted')")
    void revoke(String session, String profile);
    @Modifying
    @Query("update VideoCall c set c.state = 'ended' where c.sessionId = :workspace and c.state in ('ringing', 'accepted')")
    void endWorkspaceCalls(String workspace);
    List<VideoCall> findBySessionIdAndStateInOrderByCreatedAtDesc(String sessionId, Collection<String> states);
    List<VideoCall> findByProfileIdAndStateInOrderByCreatedAtDesc(String profileId, Collection<String> states);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from VideoCall c where c.id = :id")
    Optional<VideoCall> lock(@Param("id") String id);
}
