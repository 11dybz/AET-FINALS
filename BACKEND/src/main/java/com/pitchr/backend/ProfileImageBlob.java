package com.pitchr.backend;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Binary payload entity deliberately kept separate from gallery metadata queries. */
@Entity
@Table(name = "profile_image_blobs")
public class ProfileImageBlob {
    @Id @Column(name = "image_id") Long imageId;
    // VARBINARY maps to PostgreSQL BYTEA and H2's binary-varying type without PostgreSQL OID semantics.
    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(name = "data", nullable = false, columnDefinition = "BYTEA")
    byte[] data;

    /** Store an uploaded image's bytes under its already-generated gallery image id. */
    ProfileImageBlob(Long imageId, byte[] data) {
        this.imageId = imageId;
        this.data = data;
    }

    /** JPA constructor for image-serving reads. */
    protected ProfileImageBlob() {}
}
