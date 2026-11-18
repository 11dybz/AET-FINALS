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
        mvc.perform(put("/api/me/swipes/" + id).cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"like\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/me/conversations/" + id + "/messages").cookie(visitor).contentType(MediaType.APPLICATION_JSON)
            .content("{\"body\":\"Hello developer\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.sender").value("visitor"));
        mvc.perform(get("/api/me/conversations/" + id + "/messages").cookie(other)).andExpect(status().isForbidden());
        mvc.perform(get("/api/team/conversations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/team/conversations/" + visitor.getValue() + "/" + id + "/messages")
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
        var stored = sessions.findById(visitor.getValue()).orElseThrow();
        stored.expiresAt = Instant.now().minusSeconds(1); sessions.saveAndFlush(stored);
        mvc.perform(get("/api/me/matches").cookie(visitor)).andExpect(status().isUnauthorized());
        var renewed = mvc.perform(post("/api/session").cookie(visitor)).andExpect(status().isOk()).andReturn();
        assertThat(renewed.getResponse().getCookie(PortfolioController.COOKIE).getValue()).isNotEqualTo(visitor.getValue());
        mvc.perform(options("/api/profiles").header("Origin", "http://localhost:5500")
            .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-Admin-Key"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5500"));
        mvc.perform(options("/api/profiles").header("Origin", "https://untrusted.example")
            .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
    }

    private Cookie session() throws Exception {
        MvcResult result = mvc.perform(post("/api/session")).andExpect(status().isOk()).andReturn();
        Cookie cookie = result.getResponse().getCookie(PortfolioController.COOKIE);
        assertThat(cookie).isNotNull();
        return cookie;
    }
}
