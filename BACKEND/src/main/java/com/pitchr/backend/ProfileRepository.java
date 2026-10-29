package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProfileRepository extends JpaRepository<Profile, String> {
    List<Profile> findAllByOrderByDisplayOrderAsc();
}
