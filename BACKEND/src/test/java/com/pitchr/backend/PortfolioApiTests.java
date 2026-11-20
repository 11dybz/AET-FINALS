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
    "pitchr.cookie-secure=false"
})
class PortfolioApiTests {
    @Value("${local.server.port}") int port;
    @Autowired SessionRepository sessions;
    @Autowired AccountService accountService;
    @Autowired AccountRepository owners;
    @Autowired AccountSessionRepository authSessions;
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
        assertThat(profiles.size()).isGreaterThanOrEqualTo(4);
        assertThat(profiles.get(0).get("id").asString()).isEqualTo("chee-reynaldo");
        for (JsonNode profile : profiles) {
            if (!List.of("chee-reynaldo","dapog-john-greg","fontelar-dave","villanueva-justin").contains(profile.get("id").asString())) continue;
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
        accept(visitor,"chee-reynaldo");
        var reloaded = HttpClient.newHttpClient().send(builder("GET", "/me/matches", visitor, null).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(body(reloaded).size()).isEqualTo(1);
        assertThat(body(reloaded).get(0).get("isSuper").asBoolean()).isFalse();
        assertThat(body(reloaded).get(0).get("id").asString()).isEqualTo("chee-reynaldo");
        assertThat(body(reloaded).get(0).get("details").get("projects").size()).isEqualTo(2);
        assertThat(body(request("GET", "/me/matches", session(), null)).size()).isZero();
    }

    @Test
    void repeatedSwipesCreateOneRequestAndRemovalRequiresTheConnectionAction() throws Exception {
        String visitor = session();
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"super_like\"}");
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"like\"}");
        request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"super_like\"}");
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isZero();
        accept(visitor,"fontelar-dave");
        JsonNode matches = body(request("GET", "/me/matches", visitor, null));
        assertThat(matches.size()).isEqualTo(1);
        assertThat(matches.get(0).get("isSuper").asBoolean()).isTrue();
        assertThat(swipes.findBySessionIdOrderByCreatedAtAscIdAsc(workspace(visitor))).hasSize(1);
        var passed = request("PUT", "/me/swipes/fontelar-dave", visitor, "{\"action\":\"pass\"}");
        assertThat(body(passed).get("matched").asBoolean()).isFalse();
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isEqualTo(1);
        assertThat(request("POST","/me/connections/fontelar-dave/action",visitor,"{\"action\":\"remove\"}").statusCode()).isEqualTo(200);
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
        assertThat(body(request("GET", "/me/matches", visitor, null)).size()).isZero();
        assertThat(body(request("GET", "/me/connections", visitor, null)).size()).isEqualTo(1);
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
        String accountId=accountService.requireAccount(token(visitor)).id;
        AccountSession stored=authSessions.findAll().stream().filter(row -> row.accountId.equals(accountId)).findFirst().orElseThrow();
        stored.expiresAt=Instant.now().minusSeconds(10);authSessions.saveAndFlush(stored);
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
        assertThat(swipes.findBySessionIdOrderByCreatedAtAscIdAsc(workspace(visitor))).isEmpty();
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

    private static final String PASSWORD="HTTP workflow password 42!";
    private String workspace(String cookie) {return accountService.requireAccount(token(cookie)).workspaceId;}
    private String register() throws Exception {
        String email="http-"+java.util.UUID.randomUUID()+"@example.com";
        var response=request("POST","/auth/register",null,json.writeValueAsString(java.util.Map.of(
            "name","HTTP User","email",email,"password",PASSWORD,"confirmPassword",PASSWORD)));
        assertThat(response.statusCode()).isEqualTo(201);
        return response.headers().firstValue("Set-Cookie").orElseThrow().split(";",2)[0];
    }
    private String session() throws Exception {
        String cookie=register();
        var profile=request("POST","/profiles",cookie,json.writeValueAsString(java.util.Map.of("name","HTTP "+java.util.UUID.randomUUID(),"age",24)));
        assertThat(profile.statusCode()).isEqualTo(201);
        return cookie;
    }
    private void accept(String caller,String profile) throws Exception {
        Account recipient=owners.findByProfileId(profile).orElse(null);String receiver;
        if (recipient == null) {
            receiver=register();recipient=accountService.requireAccount(token(receiver));recipient.profileId=profile;owners.saveAndFlush(recipient);
        } else {
            var result=request("POST","/auth/login",null,json.writeValueAsString(java.util.Map.of("email",recipient.email,"password",PASSWORD)));
            assertThat(result.statusCode()).isEqualTo(200);
            receiver=result.headers().firstValue("Set-Cookie").orElseThrow().split(";",2)[0];
        }
        String own=accountService.requireAccount(token(caller)).profileId;
        assertThat(request("POST","/me/connections/"+own+"/action",receiver,"{\"action\":\"accept\"}").statusCode()).isEqualTo(200);
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
