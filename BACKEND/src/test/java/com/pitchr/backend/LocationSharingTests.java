package com.pitchr.backend;

import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.*;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.web.ServletTestExecutionListener;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK, properties={
    "spring.datasource.url=jdbc:h2:mem:locations-test;DB_CLOSE_DELAY=-1", "pitchr.team-inbox-key=location-test-key"
})
@AutoConfigureMockMvc
@TestExecutionListeners(listeners={ServletTestExecutionListener.class,DependencyInjectionTestExecutionListener.class},inheritListeners=false)
class LocationSharingTests {
    @Autowired MockMvc mvc;
    @Autowired MessageRepository messages;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    final JsonMapper json = new JsonMapper();
    record User(Cookie cookie, String profile) {}

    @Test void sharesArePrivateAndOnlyTheSenderCanStopThemFromEitherThreadDirection() throws Exception {
        User a=user(),b=user(),outsider=user();
        share(a,b,15).andExpect(status().isForbidden()); connect(a,b); connect(outsider,b);
        mvc.perform(post(path(b)).contentType(MediaType.APPLICATION_JSON).content(payload(15))).andExpect(status().isUnauthorized());
        var result=share(a,b,15).andExpect(status().isOk()).andExpect(jsonPath("$.location.state").value("active"))
            .andExpect(jsonPath("$.location.latitude").value(14.6)).andExpect(jsonPath("$.body").value("Shared an approximate location")).andReturn();
        long id=json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        Message saved=messages.findById(id).orElseThrow();
        assertThat(Duration.between(saved.createdAt,saved.locationExpiresAt).toSeconds()).isBetween(899L,902L);
        mvc.perform(get(path(a)).cookie(b.cookie)).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$[0].sender").value("member")).andExpect(jsonPath("$[0].location.name").value("Near campus"));
        stop(b,a,id).andExpect(status().isForbidden()); stop(outsider,b,id).andExpect(status().isNotFound());
        stop(a,b,id).andExpect(jsonPath("$.location.state").value("stopped")).andExpect(jsonPath("$.location.latitude").isEmpty());
        stop(a,b,id).andExpect(status().isOk());
        assertThat(messages.findById(id).orElseThrow().locationLat).isNull();
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$[0].location.longitude").isEmpty()).andExpect(jsonPath("$[0].location.name").isEmpty());
        var reverse=share(b,a,60).andExpect(status().isOk()).andExpect(jsonPath("$.sender").value("visitor")).andReturn();
        long reverseId=json.readTree(reverse.getResponse().getContentAsString()).get("id").asLong();
        assertThat(Duration.between(messages.findById(reverseId).orElseThrow().createdAt,
            messages.findById(reverseId).orElseThrow().locationExpiresAt).toSeconds()).isBetween(3599L,3602L);
        stop(b,a,reverseId).andExpect(jsonPath("$.location.state").value("stopped"));
    }

    @Test void expirationRedactsAllMessageResponsesAndReplacementEndsOnlyTheSendersPreviousShare() throws Exception {
        User a=user(),b=user(); connect(a,b);
        long first=id(share(a,b,15)); long incoming=id(share(b,a,60)); long replacement=id(share(a,b,60));
        assertThat(messages.findById(first).orElseThrow().locationLat).isNull();
        assertThat(messages.findById(incoming).orElseThrow().locationStoppedAt).isNull();
        Message expired=messages.findById(replacement).orElseThrow();
        expired.locationExpiresAt=Instant.now().minusSeconds(1);messages.saveAndFlush(expired);
        mvc.perform(get(path(a)).cookie(b.cookie)).andExpect(jsonPath("$[2].location.state").value("expired"))
            .andExpect(jsonPath("$[2].location.latitude").isEmpty()).andExpect(jsonPath("$[2].location.longitude").isEmpty());
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$[2].location.name").isEmpty());
        mvc.perform(get("/api/me/conversations").cookie(b.cookie))
            .andExpect(jsonPath("$[0].lastMessage.location.latitude").isEmpty());
        String session=jdbc.queryForObject("select session_id from messages where id = ?",String.class,replacement);
        String profile=jdbc.queryForObject("select profile_id from messages where id = ?",String.class,replacement);
        mvc.perform(get("/api/team/conversations/"+session+"/"+profile+"/messages")
            .header("X-Team-Key","location-test-key")).andExpect(status().isOk())
            .andExpect(jsonPath("$[2].location.latitude").isEmpty());
        mvc.perform(post("/api/me/connections/"+b.profile+"/action").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"remove\"}")).andExpect(status().isOk());
        mvc.perform(get(path(a)).cookie(b.cookie)).andExpect(status().isForbidden());
    }

    @Test void invalidDurationsCoordinatesAndBlankLabelsNeverCreateAMessage() throws Exception {
        User a=user(),b=user(); connect(a,b);
        for (int minutes : new int[]{0,1,16,120}) share(a,b,minutes).andExpect(status().isBadRequest());
        mvc.perform(post(path(b)).cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"latitude\":91,\"longitude\":121,\"name\":\"Campus\",\"minutes\":15}")).andExpect(status().isBadRequest());
        mvc.perform(post(path(b)).cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"latitude\":14,\"longitude\":181,\"name\":\"Campus\",\"minutes\":15}")).andExpect(status().isBadRequest());
        mvc.perform(post(path(b)).cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"latitude\":14,\"longitude\":121,\"name\":\" \",\"minutes\":15}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(a.cookie)).andExpect(content().json("[]"));
    }

    private String path(User other) { return "/api/me/conversations/"+other.profile+"/locations"; }
    private String payload(int minutes) throws Exception { return json.writeValueAsString(Map.of("latitude",14.599512,"longitude",120.984223,"name","Near campus","minutes",minutes)); }
    private ResultActions share(User from,User other,int minutes) throws Exception { return mvc.perform(post(path(other)).cookie(from.cookie).contentType(MediaType.APPLICATION_JSON).content(payload(minutes))); }
    private ResultActions stop(User from,User other,long id) throws Exception { return mvc.perform(post(path(other)+"/"+id+"/stop").cookie(from.cookie)); }
    private long id(ResultActions action) throws Exception { return json.readTree(action.andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asLong(); }
    private void connect(User a,User b) throws Exception {
        mvc.perform(post("/api/me/connection-requests/"+b.profile).cookie(a.cookie)).andExpect(status().isOk());
        mvc.perform(post("/api/me/connections/"+a.profile+"/action").cookie(b.cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"accept\"}")).andExpect(status().isOk());
    }
    private User user() throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        Cookie cookie=mvc.perform(post("/api/auth/register").with(r -> { r.setRemoteAddr(email); return r; })
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("name","Location User","email",email,
                "password","Location test password 42!","confirmPassword","Location test password 42!"))))
            .andExpect(status().isCreated()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
        String profile=json.readTree(mvc.perform(post("/api/profiles").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("name","Developer "+UUID.randomUUID(),"age",22))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        return new User(cookie,profile);
    }
}
