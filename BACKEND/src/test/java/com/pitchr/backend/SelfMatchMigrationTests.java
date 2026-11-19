package com.pitchr.backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class SelfMatchMigrationTests {
    @Test void migrationRemovesOnlySelfConnectionsAndPreservesMessagesAndOtherMatches() {
        var ds=new SingleConnectionDataSource("jdbc:h2:mem:self-match-migration;DB_CLOSE_DELAY=-1","sa","",true);
        try {
        Flyway.configure().dataSource(ds).target("7").load().migrate();
        var jdbc=new JdbcTemplate(ds);
        jdbc.update("insert into visitor_sessions(id,expires_at) values ('self-workspace',DATEADD('DAY',30,CURRENT_TIMESTAMP))");
        jdbc.update("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at,profile_id) values ('self-account','Owner','self@example.com','test-hash','self-workspace',CURRENT_TIMESTAMP,'chee-reynaldo')");
        for (String id : new String[]{"chee-reynaldo","dapog-john-greg"}) {
            jdbc.update("insert into swipes(session_id,profile_id,action,created_at,updated_at) values ('self-workspace',?,'like',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",id);
            jdbc.update("insert into video_calls(id,session_id,profile_id,state,offer,created_at,visitor_heartbeat,team_heartbeat) values (?,'self-workspace',?,'accepted','v=0',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",id,id);
            jdbc.update("insert into notifications(session_id,profile_id,kind,body,created_at) values ('self-workspace',?,'match','Saved match',CURRENT_TIMESTAMP)",id);
        }
        jdbc.update("insert into messages(session_id,profile_id,sender,body,created_at) values ('self-workspace','chee-reynaldo','visitor','Existing history',CURRENT_TIMESTAMP)");
        Flyway.configure().dataSource(ds).load().migrate();
        assertThat(jdbc.queryForObject("select action from swipes where profile_id='chee-reynaldo'",String.class)).isEqualTo("pass");
        assertThat(jdbc.queryForObject("select action from swipes where profile_id='dapog-john-greg'",String.class)).isEqualTo("like");
        assertThat(jdbc.queryForObject("select state from video_calls where id='chee-reynaldo'",String.class)).isEqualTo("ended");
        assertThat(jdbc.queryForObject("select state from video_calls where id='dapog-john-greg'",String.class)).isEqualTo("accepted");
        assertThat(jdbc.queryForObject("select count(*) from notifications where profile_id='chee-reynaldo' and read_at is not null",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notifications where profile_id='dapog-john-greg' and read_at is null",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select body from messages where session_id='self-workspace'",String.class)).isEqualTo("Existing history");
        } finally { ds.destroy(); }
    }
}
