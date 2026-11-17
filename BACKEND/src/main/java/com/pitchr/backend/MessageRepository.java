package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findBySessionIdAndProfileIdOrderByIdAsc(String sessionId, String profileId);
    List<Message> findBySessionIdAndProfileIdAndIdGreaterThanOrderByIdAsc(String sessionId, String profileId, long afterId);
    List<Message> findByProfileIdOrderBySessionIdAscIdAsc(String profileId);
    List<Message> findBySessionIdAndProfileIdAndSenderAndReadAtIsNull(String sessionId, String profileId, Message.Sender sender);
}
