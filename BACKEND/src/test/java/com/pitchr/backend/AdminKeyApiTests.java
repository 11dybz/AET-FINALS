package com.pitchr.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import static org.assertj.core.api.Assertions.assertThat;

/** Separate application context verifies write protection when a deployment explicitly configures ADMIN_KEY. */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:admin-key-test;DB_CLOSE_DELAY=-1",
    "pitchr.cookie-secure=false",
    "pitchr.admin-key=integration-secret"
})
class AdminKeyApiTests {
    @Value("${local.server.port}") int port;
    private final HttpClient client = HttpClient.newHttpClient();

    // GET remains public, while create/update/delete writes reject absent keys and accept a valid key.
    @Test
    void adminKeyProtectsProfileWritesButNotPublicReads() throws Exception {
        assertThat(send("GET", "/api/profiles", null, null).statusCode()).isEqualTo(200);
        String payload = "{\"name\":\"Protected Profile\",\"age\":25,\"details\":{}}";
        assertThat(send("POST", "/api/profiles", payload, null).statusCode()).isEqualTo(403);
        var created = send("POST", "/api/profiles", payload, "integration-secret");
        assertThat(created.statusCode()).isEqualTo(201);
        String id = created.body().replaceAll("(?s).*?\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");
        assertThat(send("PUT", "/api/profiles/" + id, payload, null).statusCode()).isEqualTo(403);
        assertThat(send("DELETE", "/api/profiles/" + id, null, null).statusCode()).isEqualTo(403);
        assertThat(send("DELETE", "/api/profiles/" + id, null, "integration-secret").statusCode()).isEqualTo(204);
    }

    // This helper builds JSON or empty requests and adds the optional admin header only when supplied.
    private HttpResponse<String> send(String method, String path, String body, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (key != null) builder.header("X-Admin-Key", key);
        if (body != null) builder.header("Content-Type", "application/json");
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
