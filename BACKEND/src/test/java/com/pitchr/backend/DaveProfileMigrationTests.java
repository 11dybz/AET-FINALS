package com.pitchr.backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class DaveProfileMigrationTests {
    private SingleConnectionDataSource database(String suffix) {
        var ds = new SingleConnectionDataSource("jdbc:h2:mem:dave-link-"+suffix+";DB_CLOSE_DELAY=-1", "sa", "", true);
        Flyway.configure().dataSource(ds).target("13").load().migrate();
        return ds;
    }
    private void account(JdbcTemplate jdbc, String id, String email, String profile) {
        jdbc.update("insert into visitor_sessions(id,expires_at) values (?,DATEADD('DAY',30,CURRENT_TIMESTAMP))",id);
        jdbc.update("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at,profile_id) values (?,'Dave',?,'unchanged-password',?,CURRENT_TIMESTAMP,?)",id,email,id,profile);
    }
    @Test void requestedAccountReceivesMainProfileWithoutChangingPasswordsOrDeletingProfiles() {
        var ds=database("transfer");try {
            var jdbc=new JdbcTemplate(ds);
            account(jdbc,"old-dave","fontelardave85@gmail.com","fontelar-dave");
            account(jdbc,"new-dave","davefontelar2005@gmail.com",null);
            int profiles=jdbc.queryForObject("select count(*) from profiles",Integer.class);
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(jdbc.queryForObject("select profile_id from accounts where id='new-dave'",String.class)).isEqualTo("fontelar-dave");
            assertThat(jdbc.queryForObject("select profile_id from accounts where id='old-dave'",String.class)).isNull();
            assertThat(jdbc.queryForObject("select count(*) from accounts where password_hash='unchanged-password'",Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("select count(*) from profiles",Integer.class)).isEqualTo(profiles);
        } finally {ds.destroy();}
    }
    @Test void absentTargetAccountDoesNotRemoveExistingOwnership() {
        var ds=database("missing");try {
            var jdbc=new JdbcTemplate(ds);account(jdbc,"old-dave","fontelardave85@gmail.com","fontelar-dave");
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(jdbc.queryForObject("select profile_id from accounts where id='old-dave'",String.class)).isEqualTo("fontelar-dave");
        } finally {ds.destroy();}
    }
    @Test void unrelatedOwnerIsNotOverwritten() {
        var ds=database("unrelated");try {
            var jdbc=new JdbcTemplate(ds);account(jdbc,"owner","other@example.com","fontelar-dave");account(jdbc,"new-dave","davefontelar2005@gmail.com",null);
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(jdbc.queryForObject("select profile_id from accounts where id='owner'",String.class)).isEqualTo("fontelar-dave");
            assertThat(jdbc.queryForObject("select profile_id from accounts where id='new-dave'",String.class)).isNull();
        } finally {ds.destroy();}
    }
}
