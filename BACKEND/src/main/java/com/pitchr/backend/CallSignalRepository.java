package com.pitchr.backend;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface CallSignalRepository extends JpaRepository<CallSignal, Long> {
    List<CallSignal> findByCallIdAndSenderNotOrderByIdAsc(String callId, String sender);
    long countByCallIdAndSender(String callId, String sender);
}
