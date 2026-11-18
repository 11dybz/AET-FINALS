package com.pitchr.backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class OwnershipMigrationTests {
    @Test void existingAccountIsLinkedCaseInsensitivelyWithoutClaimingOtherProfiles() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:ownership-migration;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(ds).target("6").load().migrate();
        var jdbc = new JdbcTemplate(ds);
        for (String id : new String[]{"requested", "other"}) {
            jdbc.update("insert into visitor_sessions(id,expires_at) values (?,CURRENT_TIMESTAMP)", id);
            jdbc.update("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at) values (?,?,?,?,?,CURRENT_TIMESTAMP)",
                id, "Test User", id.equals("requested") ? "Reychee06@gmail.com" : "other@example.com", "test-only-hash", id);
        }
        Flyway.configure().dataSource(ds).load().migrate();
        assertThat(jdbc.queryForObject("select profile_id from accounts where id='requested'", String.class)).isEqualTo("chee-reynaldo");
        assertThat(jdbc.queryForObject("select profile_id from accounts where id='other'", String.class)).isNull();
        assertThatThrownBy(() -> jdbc.update("update accounts set profile_id='chee-reynaldo' where id='other'"))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
