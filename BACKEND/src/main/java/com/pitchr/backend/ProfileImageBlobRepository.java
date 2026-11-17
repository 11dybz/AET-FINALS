package com.pitchr.backend;

import org.springframework.data.jpa.repository.JpaRepository;

/** Fetches uploaded bytes only for the explicit GET /images/{id} request. */
public interface ProfileImageBlobRepository extends JpaRepository<ProfileImageBlob, Long> {}
