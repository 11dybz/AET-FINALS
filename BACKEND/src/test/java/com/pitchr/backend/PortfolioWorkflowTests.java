package com.pitchr.backend;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import java.time.Instant;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.web.ServletTestExecutionListener;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Runs real controllers, validation, transactions and H2 migrations without binding a TCP port. */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
    "spring.datasource.url=jdbc:h2:mem:workflow-test;DB_CLOSE_DELAY=-1",
    "pitchr.admin-key=workflow-admin", "pitchr.team-inbox-key=workflow-team"
})
@AutoConfigureMockMvc
@TestExecutionListeners(listeners = {ServletTestExecutionListener.class, DependencyInjectionTestExecutionListener.class}, inheritListeners = false)
class PortfolioWorkflowTests {
    @Autowired MockMvc mvc;
    @Autowired SessionRepository sessions;
    @Autowired VideoCallRepository calls;
    @Autowired AccountRepository owners;
    @Autowired AccountService accountService;
    @Autowired AccountSessionRepository authSessions;
    private final JsonMapper json = new JsonMapper();

    @Test
    void pagesAndApiUseRizzumeBranding() throws Exception {
        mvc.perform(get("/api")).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Rizzume"));
        mvc.perform(get("/api/team")).andExpect(jsonPath("$.name").value("Rizzume"));
        mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("index.html"));
        for (String path : new String[]{"/index.html", "/CHEE.html", "/DAPOG.html", "/FONTELAR.html", "/VILLANUEVA.html", "/team-inbox.html"}) {
            mvc.perform(get(path)).andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("Rizzume")));
        }
        mvc.perform(get("/editor.js")).andExpect(status().isOk());
        mvc.perform(get("/.env")).andExpect(status().isNotFound());
    }

    @Test
    void validationExplainsTheActualFieldAndRejectsNullProjects() throws Exception {
        mvc.perform(post("/api/profiles").header("X-Admin-Key", "workflow-admin")
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\",\"age\":25}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("name")));
        mvc.perform(post("/api/profiles").header("X-Admin-Key", "workflow-admin")
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Null project\",\"age\":25,\"details\":{\"projects\":[null]}}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/profiles").header("X-Admin-Key", "workflow-admin")
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Bad URL\",\"age\":25,\"details\":{\"github\":\"https://?broken\"}}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/images/not-a-number")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void profileCrudGalleryAndMessagesWorkTogetherAndDeleteCleansUp() throws Exception {
        String payload = "{\"name\":\"Workflow Developer\",\"age\":25,\"tags\":[\"Java\"],\"details\":{\"projects\":[{\"title\":\"Demo\",\"desc\":\"Working project\"}]}}";
        mvc.perform(post("/api/profiles").contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isForbidden());
        String id = json.readTree(mvc.perform(post("/api/profiles").header("X-Admin-Key", "workflow-admin")
            .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String path = "/api/profiles/" + id;
        mvc.perform(put(path).header("X-Admin-Key", "workflow-admin").contentType(MediaType.APPLICATION_JSON)
            .content(payload.replace("Workflow Developer", "Updated Developer"))).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Updated Developer"));

        // A real one-pixel GIF verifies storage, MIME sniffing, ordering and binary reads.
        byte[] gif = java.util.Base64.getDecoder().decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");
        var upload = mvc.perform(multipart(path + "/images").file(new MockMultipartFile("files", "pixel.gif", "text/plain", gif))
            .header("X-Admin-Key", "workflow-admin")).andExpect(status().isCreated()).andReturn();
        long imageId = json.readTree(upload.getResponse().getContentAsString()).get(0).get("id").asLong();
        mvc.perform(get("/api/images/" + imageId)).andExpect(status().isOk()).andExpect(content().contentType("image/gif")).andExpect(content().bytes(gif));
        var linked = mvc.perform(post(path + "/images").header("X-Admin-Key", "workflow-admin").contentType(MediaType.APPLICATION_JSON)
            .content("{\"url\":\"https://example.com/image.jpg\"}")).andExpect(status().isCreated()).andReturn();
        long linkedId = json.readTree(linked.getResponse().getContentAsString()).get(0).get("id").asLong();
        mvc.perform(put(path + "/images/order").header("X-Admin-Key", "workflow-admin").contentType(MediaType.APPLICATION_JSON)
            .content("{\"imageIds\":[" + linkedId + "," + linkedId + "]}")).andExpect(status().isBadRequest());
        mvc.perform(put(path + "/images/order").header("X-Admin-Key", "workflow-admin").contentType(MediaType.APPLICATION_JSON)
            .content("{\"imageIds\":[" + linkedId + "," + imageId + "]}")).andExpect(status().isNoContent());
        mvc.perform(get(path)).andExpect(jsonPath("$.image").value("https://example.com/image.jpg"));
        mvc.perform(delete(path + "/images/" + linkedId).header("X-Admin-Key", "workflow-admin")).andExpect(status().isNoContent());
        mvc.perform(get(path)).andExpect(jsonPath("$.image").value("/api/images/" + imageId));
        mvc.perform(multipart(path + "/images").file(new MockMultipartFile("files", "script.svg", "image/png", "<svg/>".getBytes()))
            .header("X-Admin-Key", "workflow-admin")).andExpect(status().isBadRequest());

        Cookie visitor = session(); Cookie other = session();
        mvc.perform(post("/api/me/conversations/" + id + "/messages").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"body\":\"Before match\"}")).andExpect(status().isForbidden());
        connect(visitor, "/api/me/swipes/" + id);
        mvc.perform(post("/api/me/conversations/" + id + "/messages").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"body\":\"Hello developer\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.sender").value("visitor"));
        mvc.perform(get("/api/me/conversations/" + id + "/messages").cookie(other)).andExpect(status().isForbidden());
        mvc.perform(get("/api/team/conversations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/team/conversations/" + workspace(visitor) + "/" + id + "/messages")
            .header("X-Team-Key", "workflow-team").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Team reply\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.sender").value("member"));
        mvc.perform(get("/api/me/conversations").cookie(visitor)).andExpect(jsonPath("$[0].unreadCount").value(1));
        mvc.perform(post("/api/me/conversations/" + id + "/read").cookie(visitor)).andExpect(status().isOk()).andExpect(content().string(""));
        mvc.perform(get("/api/me/conversations").cookie(visitor)).andExpect(jsonPath("$[0].unreadCount").value(0));
        mvc.perform(delete(path).header("X-Admin-Key", "workflow-admin")).andExpect(status().isNoContent());
        mvc.perform(get(path)).andExpect(status().isNotFound());
        mvc.perform(get("/api/images/" + imageId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/matches").cookie(visitor)).andExpect(content().json("[]"));
    }

    @Test
    void sessionsExpireAndCorsOnlyAllowsConfiguredOrigins() throws Exception {
        mvc.perform(get("/api/me/matches")).andExpect(status().isUnauthorized());
        Cookie visitor = session();
        mvc.perform(post("/api/session").cookie(visitor)).andExpect(cookie().value(PortfolioController.COOKIE, visitor.getValue()));
        mvc.perform(put("/api/me/swipes/chee-reynaldo").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"right\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/conversations/chee-reynaldo/messages").cookie(visitor)
            .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\" \"}")).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("body")));
        String accountId=accountService.requireAccount(visitor.getValue()).id;
        var stored=authSessions.findAll().stream().filter(row -> row.accountId.equals(accountId)).findFirst().orElseThrow();
        stored.expiresAt=Instant.now().minusSeconds(1);authSessions.saveAndFlush(stored);
        mvc.perform(get("/api/me/matches").cookie(visitor)).andExpect(status().isUnauthorized());
        var renewed = mvc.perform(post("/api/session").cookie(visitor)).andExpect(status().isOk()).andReturn();
        assertThat(renewed.getResponse().getCookie(PortfolioController.COOKIE).getValue()).isNotEqualTo(visitor.getValue());
        mvc.perform(options("/api/profiles").header("Origin", "http://localhost:5500")
            .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-Admin-Key"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5500"));
        mvc.perform(options("/api/profiles").header("Origin", "https://untrusted.example")
            .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
    }

    @Test
    void notificationsAreDurableIdempotentAndIsolated() throws Exception {
        Cookie visitor = session(), other = session();
        mvc.perform(get("/api/me/notifications")).andExpect(status().isUnauthorized());
        String swipe = "/api/me/swipes/chee-reynaldo";
        for (int i = 0; i < 2; i++) connect(visitor, swipe);
        var notices = mvc.perform(get("/api/me/notifications").cookie(visitor)).andExpect(status().isOk())
            .andExpect(jsonPath("$.unreadCount").value(1)).andExpect(jsonPath("$.items.length()").value(1)).andReturn();
        long matchId = json.readTree(notices.getResponse().getContentAsString()).get("items").get(0).get("id").asLong();
        mvc.perform(get("/api/me/notifications").cookie(other)).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(post("/api/team/conversations/" + workspace(visitor) + "/chee-reynaldo/messages")
            .header("X-Team-Key", "workflow-team").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"New reply\"}"))
            .andExpect(status().isOk());
        // Read only the items already displayed; a reply arriving during the request stays unread.
        mvc.perform(post("/api/me/notifications/read").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"throughId\":" + matchId + "}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/notifications").cookie(visitor)).andExpect(jsonPath("$.unreadCount").value(1))
            .andExpect(jsonPath("$.items[0].kind").value("message"));
    }

    @Test
    void videoSignalingRequiresMatchOwnershipAndTeamConsent() throws Exception {
        Cookie visitor = session(), other = session();
        String payload = "{\"profileId\":\"chee-reynaldo\",\"offer\":\"v=0\\r\\n\"}";
        mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isForbidden());
        connect(visitor, "/api/me/swipes/chee-reynaldo");
        String id = json.readTree(mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content(payload)).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("ringing"))
            .andReturn().getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isConflict());
        mvc.perform(get("/api/me/calls/" + id).cookie(other)).andExpect(status().isNotFound());
        mvc.perform(get("/api/team/calls/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/team/calls?profileId=chee-reynaldo").header("X-Team-Key", "workflow-team"))
            .andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(post("/api/me/calls/" + id + "/action").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"accept\",\"answer\":\"v=0\\r\\n\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/team/calls/" + id + "/action").header("X-Team-Key", "workflow-team")
            .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"accept\",\"answer\":\"v=0\\r\\n\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("accepted"));
        mvc.perform(post("/api/me/calls/" + id + "/candidates").cookie(other).contentType(MediaType.APPLICATION_JSON)
            .content("{\"payload\":\"{\\\"candidate\\\":\\\"candidate:test\\\"}\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/me/calls/" + id + "/candidates").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"payload\":\"{\\\"candidate\\\":\\\"candidate:test\\\"}\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/team/calls/" + id).header("X-Team-Key", "workflow-team"))
            .andExpect(jsonPath("$.signals.length()").value(1));
        mvc.perform(get("/api/me/calls/" + id).cookie(visitor)).andExpect(jsonPath("$.signals.length()").value(0));
        mvc.perform(post("/api/me/calls/" + id + "/action").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"end\"}")).andExpect(jsonPath("$.state").value("ended"));
        mvc.perform(post("/api/team/calls/" + id + "/action").header("X-Team-Key", "workflow-team")
            .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"accept\",\"answer\":\"v=0\\r\\n\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void abandonedCallsExpireAndInvalidSignalsAreRejected() throws Exception {
        Cookie visitor = session();
        connect(visitor, "/api/me/swipes/dapog-john-greg");
        mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"dapog-john-greg\",\"offer\":\"bad\"}")).andExpect(status().isBadRequest());
        var result = mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"dapog-john-greg\",\"offer\":\"v=0\\r\\n\"}")).andReturn();
        String id = json.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/me/calls/" + id + "/candidates").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"payload\":\"{}\"}")).andExpect(status().isBadRequest());
        VideoCall call = calls.findById(id).orElseThrow(); call.createdAt = Instant.now().minusSeconds(100); calls.saveAndFlush(call);
        mvc.perform(get("/api/me/calls/" + id).cookie(visitor)).andExpect(jsonPath("$.state").value("ended"));
        mvc.perform(get("/api/me/calls").cookie(visitor)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/call-config").cookie(visitor)).andExpect(status().isOk()).andExpect(jsonPath("$.iceServers[0].urls").exists());
        mvc.perform(get("/api/team/call-config")).andExpect(status().isUnauthorized());
    }

    @Test
    void removingAConnectionEndsItsCallAndDoesNotBlockTheNextInvitation() throws Exception {
        Cookie visitor = session();
        for (String profile : new String[]{"chee-reynaldo", "dapog-john-greg"}) {
            connect(visitor, "/api/me/swipes/" + profile);
        }
        String id = json.readTree(mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"chee-reynaldo\",\"offer\":\"v=0\\r\\n\"}")).andReturn().getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/me/connections/chee-reynaldo/action").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"remove\"}")).andExpect(status().isOk());
        assertThat(calls.findById(id).orElseThrow().state).isEqualTo("ended");
        mvc.perform(get("/api/team/calls/" + id).header("X-Team-Key", "workflow-team")).andExpect(status().isForbidden());
        mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"dapog-john-greg\",\"offer\":\"v=0\\r\\n\"}")).andExpect(status().isOk());
    }

    @Test
    void profileDeletionCleansCallAndNotificationRows() throws Exception {
        String id = json.readTree(mvc.perform(post("/api/profiles").header("X-Admin-Key", "workflow-admin")
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Call cleanup\",\"age\":25}"))
            .andReturn().getResponse().getContentAsString()).get("id").asString();
        Cookie visitor = session();
        connect(visitor, "/api/me/swipes/" + id);
        String callId = json.readTree(mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"" + id + "\",\"offer\":\"v=0\\r\\n\"}"))
            .andReturn().getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/me/calls/" + callId + "/candidates").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"payload\":\"{\\\"candidate\\\":\\\"candidate:test\\\"}\"}")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/profiles/" + id).header("X-Admin-Key", "workflow-admin")).andExpect(status().isNoContent());
        assertThat(calls.findById(callId)).isEmpty();
        mvc.perform(get("/api/me/notifications").cookie(visitor)).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void repeatedInvitationsAreRateLimited() throws Exception {
        Cookie visitor = session();
        connect(visitor, "/api/me/swipes/chee-reynaldo");
        String body = "{\"profileId\":\"chee-reynaldo\",\"offer\":\"v=0\\r\\n\"}";
        for (int i = 0; i < 5; i++) {
            String callId = json.readTree(mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asString();
            mvc.perform(post("/api/me/calls/" + callId + "/action").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"end\"}")).andExpect(status().isOk());
        }
        mvc.perform(post("/api/me/calls").cookie(visitor).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests());
    }

    private static final String PASSWORD="Workflow password 42!";
    private String workspace(Cookie cookie) { return accountService.requireAccount(cookie.getValue()).workspaceId; }
    private Cookie register() throws Exception {
        String email="workflow-"+java.util.UUID.randomUUID()+"@example.com";
        return mvc.perform(post("/api/auth/register").with(r->{r.setRemoteAddr(email);return r;}).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(java.util.Map.of("name","Workflow User","email",email,"password",PASSWORD,"confirmPassword",PASSWORD))))
            .andExpect(status().isCreated()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
    }
    private Cookie session() throws Exception {
        Cookie cookie=register();
        mvc.perform(post("/api/profiles").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(java.util.Map.of("name","Workflow "+java.util.UUID.randomUUID(),"age",24))))
            .andExpect(status().isCreated());
        return cookie;
    }
    private void connect(Cookie caller,String path) throws Exception {
        String profile=path.substring("/api/me/swipes/".length());
        Account recipient=owners.findByProfileId(profile).orElse(null); Cookie receiver;
        if (recipient == null) {
            receiver=register(); recipient=accountService.requireAccount(receiver.getValue());
            recipient.profileId=profile;owners.saveAndFlush(recipient);
        } else {
            String email=recipient.email;
            receiver=mvc.perform(post("/api/auth/login").with(r->{r.setRemoteAddr(email);return r;}).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(java.util.Map.of("email",email,"password",PASSWORD))))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
        }
        mvc.perform(put(path).cookie(caller).contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"like\"}"))
            .andExpect(status().isOk());
        String own=accountService.requireAccount(caller.getValue()).profileId;
        mvc.perform(post("/api/me/connections/"+own+"/action").cookie(receiver).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"accept\"}")).andExpect(status().isOk());
    }
}
