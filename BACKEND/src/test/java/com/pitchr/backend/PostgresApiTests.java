package com.pitchr.backend;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import java.io.IOException;
import java.io.UncheckedIOException;
import static org.assertj.core.api.Assertions.assertThat;

// Reuse the complete HTTP contract suite against a real, isolated PostgreSQL server.
// This never uses credentials or data from the developer's Supabase project.
@ActiveProfiles(value = "supabase", inheritProfiles = false)
@TestPropertySource(properties = "spring.config.import=")
class PostgresApiTests extends PortfolioApiTests {
    private static final EmbeddedPostgres POSTGRES = startPostgres();

    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        // The isolated local server has no TLS certificate. Supabase connections require TLS.
        registry.add("spring.datasource.hikari.data-source-properties.sslmode", () -> "disable");
    }

    @Test
    void migrationsAndApplicationTablesUseTheDedicatedSchema() {
        assertThat(jdbc.queryForObject("select count(*) from pitchr.profiles", Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from pitchr.flyway_schema_history where success = true and type = 'SQL'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('profiles', 'swipes', 'visitor_sessions')", Integer.class)).isZero();
    }

    private static EmbeddedPostgres startPostgres() {
        try {
            return EmbeddedPostgres.builder().setLocaleConfig("locale", "C").start();
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not start the isolated PostgreSQL test database", ex);
        }
    }
}
