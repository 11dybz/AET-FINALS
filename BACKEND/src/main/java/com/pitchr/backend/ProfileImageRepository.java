package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

/** Ordered metadata lookup; no blob association is present, so these queries cannot fetch bytes. */
public interface ProfileImageRepository extends JpaRepository<ProfileImage, Long> {
    List<ProfileImage> findByProfileIdOrderByDisplayOrderAscIdAsc(String profileId);
    long countByProfileId(String profileId);
}
