package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

/** Ordered profile persistence with generated display positions handled by the service. */
public interface ProfileRepository extends JpaRepository<Profile, String> {
    List<Profile> findAllByOrderByDisplayOrderAsc();
}
