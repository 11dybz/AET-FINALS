package com.pitchr.backend;

import jakarta.persistence.*;
import java.time.Instant;

/** Gallery metadata only; binary data lives in ProfileImageBlob to keep profile reads lightweight. */
@Entity
@Table(name = "profile_images")
public class ProfileImage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(name = "profile_id", nullable = false) String profileId;
    @Column(name = "display_order", nullable = false) int displayOrder;
    @Column(name = "source_url", length = 1000) String sourceUrl;
    @Column(name = "content_type", length = 100) String contentType;
    @Column(name = "size_bytes") Long sizeBytes;
    @Column(name = "created_at", nullable = false) Instant createdAt;

    /** Metadata constructor for uploaded images or external/local URL references. */
    ProfileImage(String profileId, int displayOrder, String sourceUrl, String contentType, Long sizeBytes) {
        this.profileId = profileId;
        this.displayOrder = displayOrder;
        this.sourceUrl = sourceUrl;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.createdAt = Instant.now();
    }

    /** JPA requires a no-argument constructor when it hydrates gallery metadata. */
    protected ProfileImage() {}
}
