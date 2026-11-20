package com.pitchr.backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class ConnectionMigrationTests {
    @Test void legacyLikesNeedConsentAndReciprocalThreadsKeepTheirMessagesAndSenders() {
        var ds=new SingleConnectionDataSource("jdbc:h2:mem:connection-upgrade;DB_CLOSE_DELAY=-1","sa","",true);
        try {
            Flyway.configure().dataSource(ds).target("8").load().migrate();
            var jdbc=new JdbcTemplate(ds);
            for (String side : new String[]{"a","b"}) {
                String profile=side.equals("a") ? "chee-reynaldo" : "dapog-john-greg";
                jdbc.update("insert into visitor_sessions(id,expires_at) values (?,DATEADD('DAY',30,CURRENT_TIMESTAMP))",side);
                jdbc.update("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at,profile_id) values (?,? ,?,'test-hash',?,CURRENT_TIMESTAMP,?)",
                    side,side,side+"@example.com",side,profile);
            }
            jdbc.update("insert into swipes(session_id,profile_id,action,created_at,updated_at) values ('a','dapog-john-greg','like',DATEADD('DAY',-1,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)");
            jdbc.update("insert into swipes(session_id,profile_id,action,created_at,updated_at) values ('b','chee-reynaldo','super_like',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
            jdbc.update("insert into messages(session_id,profile_id,sender,body,created_at) values ('a','dapog-john-greg','visitor','A in first thread',CURRENT_TIMESTAMP)");
            jdbc.update("insert into messages(session_id,profile_id,sender,body,created_at) values ('b','chee-reynaldo','visitor','B in reverse thread',CURRENT_TIMESTAMP)");
            jdbc.update("insert into messages(session_id,profile_id,sender,body,created_at) values ('b','chee-reynaldo','member','A in reverse thread',CURRENT_TIMESTAMP)");
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(jdbc.queryForObject("select count(*) from connections",Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select status from connections",String.class)).isEqualTo("pending");
            assertThat(jdbc.queryForObject("select count(*) from messages where session_id='a' and profile_id='dapog-john-greg'",Integer.class)).isEqualTo(3);
            assertThat(jdbc.queryForObject("select sender from messages where body='B in reverse thread'",String.class)).isEqualTo("member");
            assertThat(jdbc.queryForObject("select sender from messages where body='A in reverse thread'",String.class)).isEqualTo("visitor");
            assertThat(jdbc.queryForObject("select count(*) from notifications where session_id='b' and kind='request'",Integer.class)).isEqualTo(1);
        } finally { ds.destroy(); }
    }
}
