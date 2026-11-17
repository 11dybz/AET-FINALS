package com.pitchr.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:portfolio-test;DB_CLOSE_DELAY=-1",
    "pitchr.cookie-secure=false",
    "pitchr.admin-key="
})
class PortfolioApiTests {
    @Value("${local.server.port}") int port;
    @Autowired SessionRepository sessions;
    @Autowired SwipeRepository swipes;
    @Autowired ProfileRepository profiles;
    @Autowired ProfileImageRepository images;
    @Autowired ProfileImageBlobRepository imageBlobs;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = new JsonMapper();

    @Test
    void homepageMemberPagesAndAssetsAreServed() throws Exception {
        for (String path : List.of("/", "/index.html", "/CHEE.html", "/DAPOG.html",
                "/FONTELAR.html", "/VILLANUEVA.html", "/style.css", "/script.js",
                "/images/chee.jpg", "/images/greg.jpg", "/images/dave.jpg", "/images/justin.jpg")) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build(),
                HttpResponse.BodyHandlers.ofByteArray());
            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(response.body()).as(path).isNotEmpty();
            if (path.equals("/")) {
                assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("text/html");
                assertThat(new String(response.body(), java.nio.charset.StandardCharsets.UTF_8)).contains("homeScreen");
            }
        }
        for (String path : List.of("/.env", "/pom.xml", "/api/missing")) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build(),
                HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).as(path).isEqualTo(404);
        }
    }

    @Test
    void updatedStaticFilesAreNotHiddenByBrowserCache() throws Exception {
        for (String path : List.of("/", "/CHEE.html", "/script.js", "/images/greg.jpg")) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                    .header("If-Modified-Since", "Fri, 01 Feb 1980 00:00:00 GMT").build(),
                HttpResponse.BodyHandlers.ofByteArray());
            assertThat(response.statusCode()).as(path).isEqualTo(200);
            assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
            assertThat(response.headers().firstValue("Last-Modified")).isEmpty();
            assertThat(response.body()).isNotEmpty();
        }
    }

    @Test
    void apiBaseListsTheAvailableRoutes() throws Exception {
        for (String path : List.of("", "/")) {
            var response = request("GET", path, null, null);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(body(response).get("endpoints").get("profiles").asString()).isEqualTo("GET /api/profiles");
        }
    }

    @Test
    void seededProfilesMatchTheFrontendContract() throws Exception {
        var response = request("GET", "/profiles", null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode profiles = body(response);
        assertThat(profiles.size()).isEqualTo(4);
        assertThat(profiles.get(0).get("id").asString()).isEqualTo("chee-reynaldo");
        for (JsonNode profile : profiles) {
            assertThat(profile.get("tags").size()).isGreaterThan(0);
            assertThat(profile.get("dealbreakers").size()).isEqualTo(3);
            assertThat(profile.get("details").get("projects").size()).isEqualTo(2);
            assertThat(profile.get("details").get("projects").get(0).get("desc").asString()).isNotBlank();
            // V3 returns ordered gallery metadata while leaving binary bytes out of profile responses.
            assertThat(profile.get("images").isArray()).isTrue();
            assertThat(profile.get("images").get(0).get("url").asString()).startsWith("/images/");
            var detail = request("GET", "/profiles/" + profile.get("id").asString(), null, null);
            assertThat(body(detail)).isEqualTo(profile);
        }
    }

    @Test
    void sessionResumesAndUsesHttpOnlyCookie() throws Exception {
        var first = request("POST", "/session", null, null);
        String setCookie = first.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(setCookie).contains("HttpOnly", "SameSite=Lax", "Path=/api", "Max-Age=");
        String cookie = setCookie.split(";", 2)[0];
        var resumed = request("POST", "/session", cookie, null);
        assertThat(resumed.headers().firstValue("Set-Cookie").orElseThrow()).startsWith(cookie + ";");
        assertThat(body(resumed).get("expiresAt")).isEqualTo(body(first).get("expiresAt"));
    }

    @Test
    void likesSurviveNewHttpClientsAndVisitorsAreIsolated() throws Exception {
        String visitor = session();
        assertThat(request("PUT", "/me/swipes/chee-reynaldo", visitor, "{\"action\":\"like\"}").statusCode()).isEqualTo(200);
        var reloaded = HttpClient.newHttpClient().send(builder("GET", "/me/matches", visitor, null).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(body(reloaded).size()).isEqualTo(1);
        assertThat(body(reloaded).get(0).get("isSuper").asBoolean()).isFalse();
        assertThat(body(reloaded).get(0).get("id").asString()).isEqualTo("chee-reynaldo");
        assertThat(body(reloaded).get(0).get("details").get("projects").size()).isEqualTo(2);
        assertThat(body(request("GET", "/me/matches", session(), null)).size()).isZero();
    }

    @Test
    void repeatedSwipesUpdateOneRowAndPassRemovesMatch() throws Exception {
        String visitor = session();
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"like\"}");
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"like\"}");
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"super_like\"}");
        JsonNode matches = body(request("GET", "/me/matches", visitor, null));
        assertThat(matches.size()).isEqualTo(1);
        assertThat(matches.get(0).get("isSuper").asBoolean()).isTrue();
        assertThat(swipes.findBySessionIdOrderByCreatedAtAscIdAsc(token(visitor))).hasSize(1);
        var passed = request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"pass\"}");
        assertThat(body(passed).get("matched").asBoolean()).isFalse();
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isZero();
    }

    @Test
    void concurrentRetriesCannotCreateDuplicateMatches() throws Exception {
        String visitor = session();
        var requests = java.util.stream.IntStream.range(0, 6)
            .mapToObj(i -> client.sendAsync(builder("PUT", "/me/swipes/dapog-john-greg", visitor,
                "{\"action\":\"like\"}").build(), HttpResponse.BodyHandlers.ofString())).toList();
        CompletableFuture.allOf(requests.toArray(CompletableFuture[]::new)).join();
        for (var response : requests) assertThat(response.join().statusCode()).isEqualTo(200);
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isEqualTo(1);
    }

    @Test
    void missingAndInvalidSessionsAreUnauthorized() throws Exception {
        for (String visitor : new String[]{null, "PITCHR_SESSION=invalid"}) {
            assertThat(request("GET", "/me/matches", visitor, null).statusCode()).isEqualTo(401);
            assertThat(request("PUT", "/me/swipes/chee-reynaldo", visitor, "{\"action\":\"like\"}").statusCode()).isEqualTo(401);
        }
    }

    @Test
    void expiredSessionIsRejectedAndReplaced() throws Exception {
        String visitor = session();
        VisitorSession stored = sessions.findById(token(visitor)).orElseThrow();
        stored.expiresAt = Instant.now().minusSeconds(10);
        sessions.saveAndFlush(stored);
        assertThat(request("GET", "/me/matches", visitor, null).statusCode()).isEqualTo(401);
        String renewed = request("POST", "/session", visitor, null).headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(renewed).doesNotStartWith(visitor + ";");
    }

    @Test
    void invalidActionsAndUnknownProfilesDoNotWriteSwipes() throws Exception {
        String visitor = session();
        for (String payload : List.of("{}", "{\"action\":null}", "{\"action\":\"right\"}")) {
            var response = request("PUT", "/me/swipes/chee-reynaldo", visitor, payload);
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(body(response).get("message").asString()).contains("action");
        }
        var malformed = request("PUT", "/me/swipes/chee-reynaldo", visitor, "{broken");
        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(body(malformed).get("message").asString()).contains("malformed");
        assertThat(request("GET", "/profiles/missing", null, null).statusCode()).isEqualTo(404);
        assertThat(request("PUT", "/me/swipes/missing", visitor, "{\"action\":\"like\"}").statusCode()).isEqualTo(404);
        assertThat(swipes.findBySessionIdOrderByCreatedAtAscIdAsc(token(visitor))).isEmpty();
    }

    @Test
    void corsAllowsConfiguredFrontendAndRejectsOtherOrigins() throws Exception {
        var allowed = client.send(builder("OPTIONS", "/me/swipes/chee-reynaldo", null, null)
            .header("Origin", "http://localhost:5500")
            .header("Access-Control-Request-Method", "PUT")
            .header("Access-Control-Request-Headers", "content-type").build(), HttpResponse.BodyHandlers.ofString());
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:5500");
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Credentials")).contains("true");
        var denied = client.send(builder("POST", "/session", null, null)
            .header("Origin", "https://untrusted.example").build(), HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(403);
    }

    @Test
    void teamContactIsAvailable() throws Exception {
        var response = request("GET", "/team", null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(body(response).get("email").asString()).isEqualTo("team.leads@example.com");
    }

    // Full CRUD verifies the server-generated slug, immutable id, and replacement semantics.
    @Test
    void profileCrudCreatesUpdatesAndDeletes() throws Exception {
        String payload = """
            {"name":"Ada Lovelace","persona":"Engineer","age":28,"location":"London","role":"Developer",
             "verified":true,"matchPercentage":"New","bio":"Builds systems","tags":["Java"],
             "dealbreakers":["Writes tests"],"details":{"fullBio":"Detailed profile","projects":[{"title":"Engine","desc":"Built it"}],
             "github":"https://github.com/ada","linkedin":"https://linkedin.com/in/ada","email":"ada@example.com"}}
            """;
        var created = request("POST", "/profiles", null, payload);
        assertThat(created.statusCode()).isEqualTo(201);
        JsonNode profile = body(created);
        String id = profile.get("id").asString();
        assertThat(id).isEqualTo("ada-lovelace");
        assertThat(profile.get("images").size()).isZero();
        String updated = payload.replace("Ada Lovelace", "Ada Lovelace Updated").replace("28", "29");
        var replaced = request("PUT", "/profiles/" + id, null, updated);
        assertThat(replaced.statusCode()).isEqualTo(200);
        assertThat(body(replaced).get("id").asString()).isEqualTo(id);
        assertThat(body(replaced).get("age").asInt()).isEqualTo(29);
        assertThat(request("DELETE", "/profiles/" + id, null, null).statusCode()).isEqualTo(204);
        assertThat(request("GET", "/profiles/" + id, null, null).statusCode()).isEqualTo(404);
    }

    // Bean Validation returns the failing field rather than a misleading swipe-action message.
    @Test
    void profileValidationReturnsFieldSpecificErrors() throws Exception {
        var response = request("POST", "/profiles", null,
            "{\"name\":\"Too Young\",\"age\":15,\"details\":{}}" );
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(body(response).get("message").asString()).contains("age");
    }

    // Multipart upload, blob streaming, order changes, and deletion exercise the complete gallery contract.
    @Test
    void imageUploadServeReorderAndDeleteWork() throws Exception {
        String created = request("POST", "/profiles", null,
            "{\"name\":\"Gallery Owner\",\"age\":24,\"details\":{}}" ).body();
        String id = json.readTree(created).get("id").asString();
        byte[] jpeg = new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x01, 0x02, 0x03};
        byte[] png = new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0x01};
        String boundary = "pitchr-test-boundary";
        byte[] multipart = multipart(boundary, List.of(new UploadPart("one.jpg", jpeg), new UploadPart("two.png", png)));
        var upload = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/profiles/" + id + "/images"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(multipart)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(upload.statusCode()).isEqualTo(201);
        JsonNode items = json.readTree(upload.body());
        long first = items.get(0).get("id").asLong();
        long second = items.get(1).get("id").asLong();
        var profile = body(request("GET", "/profiles/" + id, null, null));
        assertThat(profile.get("images").get(0).get("id").asLong()).isEqualTo(first);
        var served = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/images/" + first)).GET().build(),
            HttpResponse.BodyHandlers.ofByteArray());
        assertThat(served.statusCode()).isEqualTo(200);
        assertThat(served.headers().firstValue("Content-Type").orElse("")).contains("image/jpeg");
        assertThat(served.headers().firstValue("X-Content-Type-Options").orElse("")).isEqualTo("nosniff");
        assertThat(served.headers().firstValue("Cache-Control").orElse("")).contains("immutable");
        assertThat(request("PUT", "/profiles/" + id + "/images/order", null,
            "{\"imageIds\":[" + second + "," + first + "]}").statusCode()).isEqualTo(204);
        assertThat(body(request("GET", "/profiles/" + id, null, null)).get("images").get(0).get("id").asLong()).isEqualTo(second);
        assertThat(request("DELETE", "/profiles/" + id + "/images/" + second, null, null).statusCode()).isEqualTo(204);
        assertThat(images.findByProfileIdOrderByDisplayOrderAscIdAsc(id)).hasSize(1);
        assertThat(request("DELETE", "/profiles/" + id, null, null).statusCode()).isEqualTo(204);
    }

    // File signatures are authoritative: a .jpg filename with non-image bytes is rejected.
    @Test
    void invalidImageTypeIsRejected() throws Exception {
        String created = request("POST", "/profiles", null,
            "{\"name\":\"Bad Image Owner\",\"age\":24,\"details\":{}}" ).body();
        String id = json.readTree(created).get("id").asString();
        String boundary = "pitchr-invalid-boundary";
        byte[] multipart = multipart(boundary, List.of(new UploadPart("bad.jpg", new byte[]{1, 2, 3, 4})));
        var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/profiles/" + id + "/images"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(multipart)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json.readTree(response.body()).get("message").asString()).contains("JPEG");
        assertThat(request("DELETE", "/profiles/" + id, null, null).statusCode()).isEqualTo(204);
    }

    // The multipart resolver rejects a part larger than the configured 5 MB per-image limit.
    @Test
    void imageLargerThanFiveMegabytesIsRejected() throws Exception {
        String created = request("POST", "/profiles", null,
            "{\"name\":\"Large Image Owner\",\"age\":24,\"details\":{}}" ).body();
        String id = json.readTree(created).get("id").asString();
        byte[] oversized = new byte[5 * 1024 * 1024 + 1];
        oversized[0] = (byte) 0xff; oversized[1] = (byte) 0xd8; oversized[2] = (byte) 0xff;
        String boundary = "pitchr-large-boundary";
        byte[] multipart = multipart(boundary, List.of(new UploadPart("large.jpg", oversized)));
        var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/profiles/" + id + "/images"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(multipart)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(json.readTree(response.body()).get("message").asString()).contains("5 MB");
        assertThat(request("DELETE", "/profiles/" + id, null, null).statusCode()).isEqualTo(204);
    }

    // Deleting a profile removes its swipe rows and gallery metadata/blob rows in the same transaction.
    @Test
    void deletingProfileCascadesGalleryAndSwipes() throws Exception {
        String visitor = session();
        String created = request("POST", "/profiles", null,
            "{\"name\":\"Cascade Test\",\"age\":25,\"details\":{}}" ).body();
        String id = json.readTree(created).get("id").asString();
        request("PUT", "/me/swipes/" + id, visitor, "{\"action\":\"like\"}");
        byte[] jpeg = new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x01};
        String boundary = "pitchr-cascade-boundary";
        byte[] multipart = multipart(boundary, List.of(new UploadPart("cascade.jpg", jpeg)));
        client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/profiles/" + id + "/images"))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofByteArray(multipart)).build(), HttpResponse.BodyHandlers.ofString());
        Long imageId = images.findByProfileIdOrderByDisplayOrderAscIdAsc(id).get(0).id;
        assertThat(request("DELETE", "/profiles/" + id, null, null).statusCode()).isEqualTo(204);
        assertThat(swipes.findBySessionIdOrderByCreatedAtAscIdAsc(token(visitor))).isEmpty();
        assertThat(images.findById(imageId)).isEmpty();
        assertThat(imageBlobs.findById(imageId)).isEmpty();
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isZero();
        assertThat(request("GET", "/images/" + imageId, null, null).statusCode()).isEqualTo(404);
    }

    // Multipart builder keeps the integration tests independent of third-party HTTP clients.
    private byte[] multipart(String boundary, List<UploadPart> parts) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        for (UploadPart part : parts) {
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"files\"; filename=\"" + part.name()
                + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            output.write(part.bytes());
            output.write("\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        output.write(("--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return output.toByteArray();
    }
    private record UploadPart(String name, byte[] bytes) {}

    private String session() throws Exception {
        var response = request("POST", "/session", null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        return response.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0];
    }
    private String token(String cookie) { return cookie.substring(cookie.indexOf('=') + 1); }
    private JsonNode body(HttpResponse<String> response) { return json.readTree(response.body()); }
    private HttpResponse<String> request(String method, String path, String cookie, String payload) throws Exception {
        return client.send(builder(method, path, cookie, payload).build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpRequest.Builder builder(String method, String path, String cookie, String payload) {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api" + path));
        if (cookie != null) builder.header("Cookie", cookie);
        if (payload != null) builder.header("Content-Type", "application/json");
        return builder.method(method, payload == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(payload));
    }
}
