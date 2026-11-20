package com.pitchr.backend;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class TeamOwnershipMigrationTests {
    private SingleConnectionDataSource database() {
        var ds = new SingleConnectionDataSource(
            "jdbc:h2:mem:team-ownership-" + UUID.randomUUID(), "sa", "", true);
        Flyway.configure().dataSource(ds).target("10").load().migrate();
        return ds;
    }

    private void account(JdbcTemplate jdbc, String id, String email, String profileId) {
        jdbc.update("insert into visitor_sessions(id,expires_at) values (?,CURRENT_TIMESTAMP)", id);
        jdbc.update("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at,profile_id) "
                + "values (?,?,?,?,?,CURRENT_TIMESTAMP,?)",
            id, "Team Member", email, "unchanged-test-hash", id, profileId);
    }

    private String profile(JdbcTemplate jdbc, String id) {
        return jdbc.queryForObject("select profile_id from accounts where id=?", String.class, id);
    }

    @Test void linksOnlyRequestedAccountsAndPreservesCredentialsAndWorkspaces() {
        var ds = database();
        try {
            var jdbc = new JdbcTemplate(ds);
            account(jdbc, "john", "JohnGregDapog07@gmail.com", null);
            account(jdbc, "justin", "villanuevajustin270@gmail.com", null);
            account(jdbc, "dave", "fontelardave85@gmail.com", null);
            account(jdbc, "other", "other@example.com", null);
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(profile(jdbc, "john")).isEqualTo("dapog-john-greg");
            assertThat(profile(jdbc, "justin")).isEqualTo("villanueva-justin");
            assertThat(profile(jdbc, "dave")).isEqualTo("fontelar-dave");
            assertThat(profile(jdbc, "other")).isNull();
            assertThat(jdbc.queryForList("select password_hash from accounts", String.class))
                .containsOnly("unchanged-test-hash");
            assertThat(jdbc.queryForList("select id from accounts where workspace_id=id", String.class))
                .containsExactlyInAnyOrder("john", "justin", "dave", "other");
            assertThat(jdbc.queryForObject("select count(*) from profiles", Integer.class)).isEqualTo(4);
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(profile(jdbc, "john")).isEqualTo("dapog-john-greg");
        } finally { ds.destroy(); }
    }

    @Test void preservesExistingOwnershipAndDoesNotCreateMissingAccounts() {
        var ds = database();
        try {
            var jdbc = new JdbcTemplate(ds);
            account(jdbc, "existing-owner", "owner@example.com", "dapog-john-greg");
            account(jdbc, "john", "johngregdapog07@gmail.com", null);
            account(jdbc, "justin", "villanuevajustin270@gmail.com", "chee-reynaldo");
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(profile(jdbc, "existing-owner")).isEqualTo("dapog-john-greg");
            assertThat(profile(jdbc, "john")).isNull();
            assertThat(profile(jdbc, "justin")).isEqualTo("chee-reynaldo");
            assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class)).isEqualTo(3);
        } finally { ds.destroy(); }
    }
}
