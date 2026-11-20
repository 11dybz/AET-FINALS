package com.pitchr.backend;

import java.util.*;
import org.springframework.data.jpa.repository.*;

interface ConnectionRepository extends JpaRepository<Connection, String> {
    Optional<Connection> findByLowProfileIdAndHighProfileId(String low, String high);
    Optional<Connection> findByThreadSessionIdAndThreadProfileId(String session, String profile);
    @Query("select c from Connection c where c.lowProfileId = :profile or c.highProfileId = :profile order by c.updatedAt desc, c.id")
    List<Connection> forProfile(String profile);
    List<Connection> findByStatusOrderByUpdatedAtDesc(String status);
}
