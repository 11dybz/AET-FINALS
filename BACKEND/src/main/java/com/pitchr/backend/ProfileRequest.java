package com.pitchr.backend;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

/** Validated full-replacement payload for creating or updating a profile. */
public record ProfileRequest(
    @NotBlank @Size(min = 1, max = 100) String name,
    @Size(max = 255) String persona,
    @NotNull @Min(16) @Max(120) Integer age,
    @Size(max = 255) String location,
    @Size(max = 255) String role,
    Boolean verified,
    @Size(max = 255) String matchPercentage,
    @Size(max = 2000) String bio,
    @Size(max = 15) List<@NotBlank @Size(max = 50) String> tags,
    @Size(max = 10) List<@NotBlank @Size(max = 300) String> dealbreakers,
    @Valid DetailsRequest details
) {
    /** Nested request mirrors the existing details JSON structure, including project `desc`. */
    public record DetailsRequest(
        @Size(max = 4000) String fullBio,
        @Size(max = 10) List<@Valid ProjectRequest> projects,
        @Pattern(regexp = "^$|https?://.+", message = "must be an http(s) URL") @Size(max = 255) String github,
        @Pattern(regexp = "^$|https?://.+", message = "must be an http(s) URL") @Size(max = 255) String linkedin,
        @Email @Size(max = 255) String email
    ) {}

    /** Project request keeps the public API's `desc` name while the entity stores `description`. */
    public record ProjectRequest(@Size(max = 255) String title, @Size(max = 2000) String desc) {}
}
