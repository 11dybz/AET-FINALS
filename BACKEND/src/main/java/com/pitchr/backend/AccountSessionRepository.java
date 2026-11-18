package com.pitchr.backend;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;

interface AccountSessionRepository extends JpaRepository<AccountSession, String> {
    void deleteByAccountIdAndExpiresAtBefore(String accountId, Instant before);
}
