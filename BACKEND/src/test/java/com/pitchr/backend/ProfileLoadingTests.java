package com.pitchr.backend;

import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;

import static org.assertj.core.api.Assertions.assertThat;

/** Guards against reintroducing one gallery/detail query per profile on a remote database. */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
    "spring.datasource.url=jdbc:h2:mem:profile-loading;DB_CLOSE_DELAY=-1",
    "spring.jpa.properties.hibernate.generate_statistics=true",
    "logging.level.org.hibernate.engine.internal.StatisticalLoggingSessionEventListener=OFF"
})
@TestExecutionListeners(listeners = DependencyInjectionTestExecutionListener.class, inheritListeners = false)
class ProfileLoadingTests {
    @Autowired PortfolioService service;
    @Autowired EntityManagerFactory factory;

    @Test
    void rosterLoadsCollectionsAndGalleryInFiveQueriesRatherThanPerProfile() {
        // Include enough complete profiles to catch N+1 fetching even if the seed roster changes.
        for (int i = 0; i < 12; i++) {
            var request = new ProfileRequest("Loading " + i, "Builder", 25, "Manila", "Developer", false,
                "New", "Hello", List.of("Java", "Design"), List.of("Team player"),
                new ProfileRequest.DetailsRequest("Full story", List.of(new ProfileRequest.ProjectRequest("Demo", "Built it")), "", "", ""));
            var created = service.createProfile(request);
            service.addImageUrl(created.id(), "https://example.com/" + i + ".jpg");
        }
        var statistics = factory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        var roster = service.profiles();
        assertThat(roster.size()).isGreaterThanOrEqualTo(12);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(5);
        var profile = roster.stream().filter(p -> p.name().equals("Loading 0")).findFirst().orElseThrow();
        assertThat(profile.tags()).containsExactly("Java", "Design");
        assertThat(profile.dealbreakers()).containsExactly("Team player");
        assertThat(profile.details().projects()).containsExactly(new ProfileResponse.Project("Demo", "Built it"));
        assertThat(profile.images()).hasSize(1);
    }
}
