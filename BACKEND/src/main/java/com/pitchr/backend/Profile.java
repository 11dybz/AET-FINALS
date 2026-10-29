package com.pitchr.backend;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "profiles")
public class Profile {
    @Id String id;
    String persona;
    String name;
    int age;
    String location;
    String role;
    @Column(length = 1000) String image;
    boolean verified;
    String matchPercentage;
    @Column(length = 2000) String bio;
    @Column(length = 4000) String fullBio;
    String github;
    String linkedin;
    String email;
    int displayOrder;

    @ElementCollection
    @CollectionTable(name = "profile_skills", joinColumns = @JoinColumn(name = "profile_id"))
    @OrderColumn(name = "display_order")
    @Column(name = "skill")
    List<String> tags = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "profile_highlights", joinColumns = @JoinColumn(name = "profile_id"))
    @OrderColumn(name = "display_order")
    @Column(name = "highlight", length = 1000)
    List<String> dealbreakers = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "projects", joinColumns = @JoinColumn(name = "profile_id"))
    @OrderColumn(name = "display_order")
    List<Project> projects = new ArrayList<>();

    @Embeddable
    public static class Project {
        String title;
        @Column(name = "description", length = 2000) String description;
    }
}
