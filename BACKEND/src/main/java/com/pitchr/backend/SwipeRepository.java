package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface SwipeRepository extends JpaRepository<Swipe, Long> {
    @Override
    @EntityGraph(attributePaths = {"profile", "session"})
    List<Swipe> findAll();
    Optional<Swipe> findBySessionIdAndProfileId(String sessionId, String profileId);
    @EntityGraph(attributePaths = "profile")
    List<Swipe> findBySessionIdOrderByCreatedAtAscIdAsc(String sessionId);
    /** Remove all visitor decisions first because V1's profile foreign key has no ON DELETE CASCADE. */
    @Modifying
    @Query("delete from Swipe s where s.profile.id = :profileId")
    void deleteAllByProfileId(@Param("profileId") String profileId);
}
