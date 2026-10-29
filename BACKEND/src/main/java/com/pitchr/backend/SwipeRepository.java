package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.List;
import java.util.Optional;

public interface SwipeRepository extends JpaRepository<Swipe, Long> {
    Optional<Swipe> findBySessionIdAndProfileId(String sessionId, String profileId);
    @EntityGraph(attributePaths = "profile")
    List<Swipe> findBySessionIdOrderByCreatedAtAscIdAsc(String sessionId);
}
