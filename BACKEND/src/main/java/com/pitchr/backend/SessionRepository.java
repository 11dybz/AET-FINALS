package com.pitchr.backend;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;

public interface SessionRepository extends JpaRepository<VisitorSession, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from VisitorSession s where s.id = :id")
    Optional<VisitorSession> findForUpdate(String id);
}
