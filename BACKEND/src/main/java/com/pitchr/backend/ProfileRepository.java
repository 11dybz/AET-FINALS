package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Ordered profile persistence with generated display positions handled by the service. */
public interface ProfileRepository extends JpaRepository<Profile, String> {
    List<Profile> findAllByOrderByDisplayOrderAsc();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Profile p where p.id = :id")
    Optional<Profile> findForUpdate(String id);
}
