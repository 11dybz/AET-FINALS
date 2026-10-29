package com.pitchr.backend;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProfileResponse(
    String id, String persona, String name, int age, String location, String role,
    String image, boolean verified, String matchPercentage, String bio,
    List<String> tags, List<String> dealbreakers, Details details,
    @JsonProperty("isSuper") Boolean isSuper
) {
    public record Details(String fullBio, List<Project> projects, String github, String linkedin, String email) {}
    public record Project(String title, String desc) {}

    static ProfileResponse from(Profile p) { return from(p, null); }

    static ProfileResponse from(Profile p, Boolean isSuper) {
        return new ProfileResponse(p.id, p.persona, p.name, p.age, p.location, p.role,
            p.image, p.verified, p.matchPercentage, p.bio,
            List.copyOf(p.tags), List.copyOf(p.dealbreakers),
            new Details(p.fullBio, p.projects.stream().map(v -> new Project(v.title, v.description)).toList(),
                p.github, p.linkedin, p.email), isSuper);
    }
}
