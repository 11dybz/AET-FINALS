package com.pitchr.backend;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface VideoCallRepository extends JpaRepository<VideoCall, String> {
    @Query("select c.id from VideoCall c where (c.sessionId = :workspace or c.profileId = :profile) and c.state in ('ringing', 'accepted') order by c.id")
    List<String> activeIds(String workspace, String profile);
    @Query("select c.id from VideoCall c where c.historyRecorded = false and (c.state not in ('ringing', 'accepted') or (c.state = 'ringing' and c.createdAt < :ringingBefore) or (c.state = 'accepted' and (c.visitorHeartbeat < :heartbeatBefore or c.teamHeartbeat < :heartbeatBefore)) or c.createdAt < :maximumBefore) order by c.id")
    List<String> unfinishedIds(java.time.Instant ringingBefore, java.time.Instant heartbeatBefore, java.time.Instant maximumBefore);
    long countBySessionIdAndCreatedAtAfter(String sessionId, java.time.Instant since);
    @Modifying
    @Query("update VideoCall c set c.state = 'ended' where c.sessionId = :session and c.profileId = :profile and c.state in ('ringing', 'accepted')")
    void revoke(String session, String profile);
    @Modifying
    @Query("update VideoCall c set c.state = 'ended' where c.sessionId = :workspace and c.state in ('ringing', 'accepted')")
    void endWorkspaceCalls(String workspace);
    @Modifying
    @Query("update VideoCall c set c.state = 'ended' where c.profileId = :profile and c.state in ('ringing', 'accepted')")
    void endProfileCalls(String profile);
    List<VideoCall> findBySessionIdAndStateInOrderByCreatedAtDesc(String sessionId, Collection<String> states);
    List<VideoCall> findByProfileIdAndStateInOrderByCreatedAtDesc(String profileId, Collection<String> states);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from VideoCall c where c.id = :id")
    Optional<VideoCall> lock(@Param("id") String id);
}
