package com.pitchr.backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

class BundledPhotoMigrationTests {
    @Test void updatesBundledImageReferencesAndPreservesUploadedAndExternalPhotos() {
        var ds = new SingleConnectionDataSource("jdbc:h2:mem:bundled-photo-upgrade;DB_CLOSE_DELAY=-1", "sa", "", true);
        try {
            Flyway.configure().dataSource(ds).target("12").load().migrate();
            var jdbc = new JdbcTemplate(ds);
            jdbc.update("update profiles set image='/api/images/123' where id='chee-reynaldo'");
            jdbc.update("update profile_images set source_url='https://example.com/justin.jpg' where profile_id='villanueva-justin'");
            Flyway.configure().dataSource(ds).load().migrate();
            assertThat(jdbc.queryForObject("select image from profiles where id='chee-reynaldo'",String.class)).isEqualTo("/api/images/123");
            assertThat(jdbc.queryForObject("select image from profiles where id='dapog-john-greg'",String.class)).isEqualTo("/images/greg.png");
            assertThat(jdbc.queryForObject("select image from profiles where id='fontelar-dave'",String.class)).isEqualTo("/images/dave.png");
            assertThat(jdbc.queryForObject("select image from profiles where id='villanueva-justin'",String.class)).isEqualTo("/images/justin.png");
            assertThat(jdbc.queryForObject("select source_url from profile_images where profile_id='chee-reynaldo'",String.class)).isEqualTo("/images/chee.png");
            assertThat(jdbc.queryForObject("select source_url from profile_images where profile_id='villanueva-justin'",String.class)).isEqualTo("https://example.com/justin.jpg");
        } finally { ds.destroy(); }
    }
}
