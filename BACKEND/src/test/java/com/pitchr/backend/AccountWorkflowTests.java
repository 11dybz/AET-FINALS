package com.pitchr.backend;

import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.*;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.web.ServletTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK, properties={
    "spring.datasource.url=jdbc:h2:mem:account-test;DB_CLOSE_DELAY=-1",
    "pitchr.admin-key=account-admin", "pitchr.team-inbox-key=account-team"
})
@AutoConfigureMockMvc
@TestExecutionListeners(listeners={ServletTestExecutionListener.class, DependencyInjectionTestExecutionListener.class}, inheritListeners=false)
class AccountWorkflowTests {
    @Autowired MockMvc mvc;
    @Autowired AccountRepository accounts;
    @Autowired AccountSessionRepository sessions;
    @Autowired VideoCallRepository calls;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final JsonMapper json = new JsonMapper();
    private static final String PASSWORD = "A test password 42!";

    @Test void tunnelHostLoginPreservesSessionsAndConfiguredCorsAllowsNgrokHeaders() throws Exception {
        String email=email();register(email);
        var loggedIn=mvc.perform(post("/api/auth/login").header("Origin","https://rizzume.ngrok-free.dev")
            .header("Host","rizzume.ngrok-free.dev").header("ngrok-skip-browser-warning","1")
            // Tomcat's native proxy support normalizes the external HTTPS request before MVC.
            .with(request->{request.setScheme("https");request.setSecure(true);
                request.setServerName("rizzume.ngrok-free.dev");request.setServerPort(443);
                request.setRemoteAddr("ngrok-login-test");return request;})
            .contentType(MediaType.APPLICATION_JSON).content(credentials(email,PASSWORD)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true)).andReturn();
        Cookie cookie=loggedIn.getResponse().getCookie(PortfolioController.COOKIE);
        mvc.perform(get("/api/auth/me").cookie(cookie).header("Host","rizzume.ngrok-free.dev"))
            .andExpect(jsonPath("$.user.email").value(email));
        mvc.perform(post("/api/auth/logout").cookie(cookie).header("Origin","https://attacker.example")
            .header("Host","rizzume.ngrok-free.dev")
            .with(request->{request.setScheme("https");request.setServerName("rizzume.ngrok-free.dev");request.setServerPort(443);return request;}))
            .andExpect(status().isForbidden());
        mvc.perform(options("/api/auth/login").header("Origin","http://localhost:5500")
            .header("Access-Control-Request-Method","POST")
            .header("Access-Control-Request-Headers","content-type,ngrok-skip-browser-warning"))
            .andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Headers",org.hamcrest.Matchers.containsString("ngrok-skip-browser-warning")));
        mvc.perform(options("/api/auth/login").header("Origin","https://attacker.example")
            .header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden());
    }

    @Test void ownProfileCannotBeMatchedMessagedOrCalledEvenWithALegacySelfMatch() throws Exception {
        String ownerEmail=email(); Cookie owner=register(ownerEmail);
        var created=mvc.perform(post("/api/profiles").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Self Match Check\",\"age\":25}"))
            .andExpect(status().isCreated()).andReturn();
        String id=json.readTree(created.getResponse().getContentAsString()).get("id").asString();
        for (String action : new String[]{"like","super_like"})
            mvc.perform(put("/api/me/swipes/"+id).cookie(owner).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\""+action+"\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("You cannot match with your own profile."));
        mvc.perform(get("/api/me/profile").cookie(owner)).andExpect(jsonPath("$.id").value(id));
        mvc.perform(get("/api/profiles/"+id)).andExpect(status().isOk());
        String workspace=accounts.findByEmail(ownerEmail).orElseThrow().workspaceId;
        // Simulate a connection saved before the profile was linked to this account.
        jdbc.update("insert into swipes(session_id,profile_id,action,created_at,updated_at) values (?,?,'super_like',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",workspace,id);
        mvc.perform(get("/api/me/matches").cookie(owner)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/conversations").cookie(owner)).andExpect(content().json("[]"));
        mvc.perform(post("/api/me/conversations/"+id+"/messages").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"body\":\"Self message\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/me/calls").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\""+id+"\",\"offer\":\"v=0\\r\\n\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/me/swipes/"+id).cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"pass\"}")).andExpect(status().isOk());
        Cookie other=register(email());
        mvc.perform(put("/api/me/swipes/"+id).cookie(other).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"like\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/me/matches").cookie(other)).andExpect(jsonPath("$[0].id").value(id));
    }

    @Test void registrationHashesPasswordsAndIssuesPrivateSessionCookie() throws Exception {
        String email = email(); Cookie cookie = register(email);
        var stored = accounts.findByEmail(email).orElseThrow();
        assertThat(stored.passwordHash).startsWith("pbkdf2-sha256$600000$").doesNotContain(PASSWORD);
        assertThat(PasswordHasher.matches(PASSWORD, stored.passwordHash)).isTrue();
        assertThat(cookie.getValue()).isNotEqualTo(stored.workspaceId);
        mvc.perform(get("/api/auth/me").cookie(cookie)).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.user.name").value("Test User")).andExpect(jsonPath("$.user.email").value(email))
            .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
        mvc.perform(get("/api/me/matches").cookie(new Cookie(PortfolioController.COOKIE, stored.workspaceId)))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/session").cookie(cookie)).andExpect(cookie().value(PortfolioController.COOKIE, cookie.getValue()));
        assertThat(sessions.findAll()).noneMatch(s -> s.id.equals(cookie.getValue()));
    }

    @Test void loginAndLogoutPreserveMatchesButRevokeOldCredentials() throws Exception {
        String email = email(); Cookie first = register(email);
        mvc.perform(put("/api/me/swipes/chee-reynaldo").cookie(first).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"like\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/me/conversations/chee-reynaldo/messages").cookie(first).contentType(MediaType.APPLICATION_JSON)
            .content("{\"body\":\"Saved account conversation\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").cookie(first)).andExpect(status().isNoContent())
            .andExpect(cookie().maxAge(PortfolioController.COOKIE,0));
        mvc.perform(get("/api/auth/me").cookie(first)).andExpect(jsonPath("$.authenticated").value(false));
        mvc.perform(get("/api/me/matches").cookie(first)).andExpect(status().isUnauthorized());
        Cookie second = login(email.toUpperCase(), PASSWORD, null);
        assertThat(second.getValue()).isNotEqualTo(first.getValue());
        mvc.perform(get("/api/me/matches").cookie(second)).andExpect(jsonPath("$[0].id").value("chee-reynaldo"));
        mvc.perform(get("/api/me/conversations/chee-reynaldo/messages").cookie(second))
            .andExpect(jsonPath("$[0].body").value("Saved account conversation"));
        Cookie rotated = login(email, PASSWORD, second);
        mvc.perform(get("/api/auth/me").cookie(second)).andExpect(jsonPath("$.authenticated").value(false));
        mvc.perform(get("/api/auth/me").cookie(rotated)).andExpect(jsonPath("$.authenticated").value(true));
    }

    @Test void accountDataAndNotificationsAreIsolated() throws Exception {
        Cookie a = register(email()), b = register(email());
        mvc.perform(put("/api/me/swipes/dapog-john-greg").cookie(a).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"like\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/me/matches").cookie(b)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/notifications").cookie(a)).andExpect(jsonPath("$.unreadCount").value(1));
        mvc.perform(get("/api/me/notifications").cookie(b)).andExpect(jsonPath("$.unreadCount").value(0));
        mvc.perform(get("/api/me/conversations/dapog-john-greg/messages").cookie(b)).andExpect(status().isForbidden());
    }

    @Test void validationRejectsWeakMismatchedOrDuplicateCredentials() throws Exception {
        String email=email(); register(email);
        mvc.perform(post("/api/auth/register").with(r->{r.setRemoteAddr("duplicate-test");return r;})
            .contentType(MediaType.APPLICATION_JSON).content(registration(email.toUpperCase(),PASSWORD,PASSWORD)))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
            .content(registration(email(),"short","short"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
            .content(registration(email(),PASSWORD,"different password"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
            .content(registration("bad-email",PASSWORD,PASSWORD))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(credentials(email,"wrong password"))).andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(credentials(email(),PASSWORD))).andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
    }

    @Test void expiredSessionsCannotAccessSavedData() throws Exception {
        String email=email(); Cookie cookie=register(email);
        String id=accounts.findByEmail(email).orElseThrow().id;
        var session=sessions.findAll().stream().filter(s->s.accountId.equals(id)).findFirst().orElseThrow();
        session.expiresAt=Instant.now().minusSeconds(1);sessions.saveAndFlush(session);
        mvc.perform(get("/api/auth/me").cookie(cookie)).andExpect(jsonPath("$.authenticated").value(false));
        mvc.perform(get("/api/me/notifications").cookie(cookie)).andExpect(status().isUnauthorized());
    }

    @Test void accountCallsAndTeamRepliesShareThePersistentWorkspace() throws Exception {
        String email=email(); Cookie cookie=register(email);
        String workspace=accounts.findByEmail(email).orElseThrow().workspaceId;
        mvc.perform(put("/api/me/swipes/fontelar-dave").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"like\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/team/conversations/" + workspace + "/fontelar-dave/messages").header("X-Team-Key","account-team")
            .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Reply for account\"}")).andExpect(status().isOk());
        var result=mvc.perform(post("/api/me/calls").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
            .content("{\"profileId\":\"fontelar-dave\",\"offer\":\"v=0\\r\\n\"}")).andExpect(status().isOk()).andReturn();
        String call=json.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(get("/api/team/calls/"+call).header("X-Team-Key","account-team")).andExpect(status().isOk());
        mvc.perform(post("/api/team/calls/"+call+"/action").header("X-Team-Key","account-team").contentType(MediaType.APPLICATION_JSON)
            .content("{\"action\":\"accept\",\"answer\":\"v=0\\r\\n\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations/fontelar-dave/messages").cookie(cookie))
            .andExpect(jsonPath("$[0].body").value("Reply for account"));
        mvc.perform(post("/api/auth/logout").cookie(cookie)).andExpect(status().isNoContent());
        mvc.perform(get("/api/team/calls/"+call).header("X-Team-Key","account-team"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("ended"));
    }

    @Test void hostileOriginsAreRejectedAndRepeatedLoginsAreLimited() throws Exception {
        mvc.perform(post("/api/auth/login").header("Origin","https://attacker.example").header("Host","localhost:8080")
            .contentType(MediaType.APPLICATION_JSON).content(credentials(email(),PASSWORD))).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").header("Origin","null").header("Host","localhost:8080"))
            .andExpect(status().isForbidden());
        for(int i=0;i<20;i++) mvc.perform(post("/api/auth/login").with(r->{r.setRemoteAddr("rate-test");return r;})
            .contentType(MediaType.APPLICATION_JSON).content(credentials("missing@example.com",PASSWORD))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(r->{r.setRemoteAddr("rate-test");return r;})
            .contentType(MediaType.APPLICATION_JSON).content(credentials("missing@example.com",PASSWORD))).andExpect(status().isTooManyRequests());
    }

    @Test void pagesAreServedAndOmitPasswordRecovery() throws Exception {
        for(String path:new String[]{"/login.html","/register.html"}) mvc.perform(get(path)).andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Rizzume")))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("forgot"))));
        mvc.perform(get("/login")).andExpect(forwardedUrl("/login.html"));
        mvc.perform(get("/register")).andExpect(forwardedUrl("/register.html"));
    }

    @Test void profileWritesRequireOwnershipAcrossAllGalleryRoutes() throws Exception {
        String ownerEmail=email(); Cookie owner=register(ownerEmail), other=register(email());
        Account account=accounts.findByEmail(ownerEmail).orElseThrow(); account.profileId="chee-reynaldo"; accounts.saveAndFlush(account);
        String path="/api/profiles/chee-reynaldo", payload="{\"name\":\"CHEE, Reynaldo Joseph\",\"age\":22}";
        mvc.perform(get("/api/auth/me").cookie(owner)).andExpect(jsonPath("$.user.profileId").value("chee-reynaldo"));
        mvc.perform(get("/api/me/profile").cookie(owner)).andExpect(jsonPath("$.id").value("chee-reynaldo"));
        mvc.perform(put(path).cookie(owner).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isOk());
        mvc.perform(put(path).cookie(other).header("X-Admin-Key","account-admin").contentType(MediaType.APPLICATION_JSON)
            .content(payload)).andExpect(status().isForbidden());
        mvc.perform(put("/api/profiles/fontelar-dave").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content(payload)).andExpect(status().isForbidden());
        mvc.perform(delete(path).cookie(other)).andExpect(status().isForbidden());
        mvc.perform(post(path+"/images").cookie(other).contentType(MediaType.APPLICATION_JSON)
            .content("{\"url\":\"https://example.com/image.png\"}")).andExpect(status().isForbidden());
        var file=new org.springframework.mock.web.MockMultipartFile("files","image.gif","image/gif",
            java.util.Base64.getDecoder().decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="));
        mvc.perform(multipart(path+"/images").file(file).cookie(other)).andExpect(status().isForbidden());
        mvc.perform(delete(path+"/images/1").cookie(other)).andExpect(status().isForbidden());
        mvc.perform(put(path+"/images/order").cookie(other).contentType(MediaType.APPLICATION_JSON)
            .content("{\"imageIds\":[1]}")).andExpect(status().isForbidden());
        var result=mvc.perform(post(path+"/images").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"url\":\"https://example.com/owned.png\"}")).andExpect(status().isCreated()).andReturn();
        long image=json.readTree(result.getResponse().getContentAsString()).get(0).get("id").asLong();
        // The order request must include all images, including the seeded cover.
        var current=json.readTree(mvc.perform(get(path)).andReturn().getResponse().getContentAsString()).get("images");
        var ids=new java.util.ArrayList<Long>();current.forEach(row->ids.add(row.get("id").asLong()));
        mvc.perform(put(path+"/images/order").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(java.util.Map.of("imageIds",ids)))).andExpect(status().isNoContent());
        mvc.perform(delete(path+"/images/"+image).cookie(owner)).andExpect(status().isNoContent());
        account.profileId=null;accounts.saveAndFlush(account);
    }

    @Test void aNewUserCanCreateOneOwnProfileAndDeletionUnlinksOnlyThatProfile() throws Exception {
        String email=email();Cookie user=register(email);
        mvc.perform(get("/api/me/profile").cookie(user)).andExpect(status().isNotFound());
        String payload="{\"name\":\"Owned Developer\",\"age\":25}";
        var created=mvc.perform(post("/api/profiles").cookie(user).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isCreated()).andReturn();
        String id=json.readTree(created.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(get("/api/auth/me").cookie(user)).andExpect(jsonPath("$.user.profileId").value(id));
        mvc.perform(post("/api/profiles").cookie(user).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isConflict());
        mvc.perform(delete("/api/profiles/"+id).cookie(user)).andExpect(status().isNoContent());
        assertThat(accounts.findByEmail(email).orElseThrow().profileId).isNull();
        mvc.perform(get("/api/me/profile").cookie(user)).andExpect(status().isNotFound());
        mvc.perform(get("/api/profiles/fontelar-dave")).andExpect(status().isOk());
    }

    @Test void publicSignupCannotClaimSeededProfilesThroughEmailOrPayloadFields() throws Exception {
        String email="reychee06@gmail.com";Cookie user=register(email);
        mvc.perform(get("/api/auth/me").cookie(user)).andExpect(jsonPath("$.user.profileId").isEmpty());
        mvc.perform(put("/api/profiles/chee-reynaldo").cookie(user).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Attempted claim\",\"age\":25,\"profileId\":\"chee-reynaldo\"}"))
            .andExpect(status().isForbidden());
    }

    private String email(){return "test-"+UUID.randomUUID()+"@example.com";}
    private String credentials(String email,String password){return json.writeValueAsString(java.util.Map.of("email",email,"password",password));}
    private String registration(String email,String password,String confirm){return json.writeValueAsString(java.util.Map.of("name","Test User","email",email,"password",password,"confirmPassword",confirm));}
    private Cookie register(String email) throws Exception {
        var result=mvc.perform(post("/api/auth/register").with(r->{r.setRemoteAddr(email);return r;})
            .contentType(MediaType.APPLICATION_JSON).content(registration(email,PASSWORD,PASSWORD)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(header().string("Set-Cookie",org.hamcrest.Matchers.containsString("HttpOnly")))
            .andExpect(header().string("Set-Cookie",org.hamcrest.Matchers.containsString("SameSite=Lax")))
            .andReturn();
        return result.getResponse().getCookie(PortfolioController.COOKIE);
    }
    private Cookie login(String email,String password,Cookie previous) throws Exception {
        var request=post("/api/auth/login").with(r->{r.setRemoteAddr(email);return r;}).contentType(MediaType.APPLICATION_JSON).content(credentials(email,password));
        if(previous!=null)request.cookie(previous);
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
    }
}
