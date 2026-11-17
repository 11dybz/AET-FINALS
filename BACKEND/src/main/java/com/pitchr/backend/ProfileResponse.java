package com.pitchr.backend;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProfileResponse(
    String id, String persona, String name, int age, String location, String role,
    String image, boolean verified, String matchPercentage, String bio,
    List<String> tags, List<String> dealbreakers, Details details,
    @JsonProperty("isSuper") Boolean isSuper,
    List<Image> images
) {
    public record Details(String fullBio, List<Project> projects, String github, String linkedin, String email) {}
    public record Project(String title, String desc) {}
    /** Each gallery item exposes metadata and a URL, never the underlying binary payload. */
    public record Image(Long id, String url) {}

    static ProfileResponse from(Profile p) { return from(p, null, List.of()); }

    static ProfileResponse from(Profile p, Boolean isSuper) { return from(p, isSuper, List.of()); }

    /** Map an entity and its separately queried image metadata into the established JSON contract. */
    static ProfileResponse from(Profile p, Boolean isSuper, List<ProfileImage> imageRows) {
        List<Image> gallery = imageRows.stream().map(image -> new Image(image.id,
            image.sourceUrl != null ? image.sourceUrl : "/api/images/" + image.id)).toList();
        return new ProfileResponse(p.id, p.persona, p.name, p.age, p.location, p.role,
            p.image, p.verified, p.matchPercentage, p.bio,
            List.copyOf(p.tags), List.copyOf(p.dealbreakers),
            new Details(p.fullBio, p.projects.stream().map(v -> new Project(v.title, v.description)).toList(),
                p.github, p.linkedin, p.email), isSuper, gallery);
    }
}
