package com.pitchr.backend;

import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.*;
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
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK,properties={
    "spring.datasource.url=jdbc:h2:mem:connections-test;DB_CLOSE_DELAY=-1", "pitchr.team-inbox-key="
})
@AutoConfigureMockMvc
@TestExecutionListeners(listeners={ServletTestExecutionListener.class,DependencyInjectionTestExecutionListener.class},inheritListeners=false)
class ConnectionWorkflowTests {
    @Autowired MockMvc mvc;
    @Autowired ConnectionRepository connections;
    @Autowired AccountRepository accounts;
    @Autowired CallHistoryService callHistory;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    final JsonMapper json=new JsonMapper();
    record User(Cookie cookie,String profile,String email) {}

    @Test void requestsRequireConsentAndOnlyTheRecipientCanAccept() throws Exception {
        User a=user(true),b=user(true),stranger=user(true),incomplete=user(false);
        mvc.perform(post("/api/me/connection-requests/"+b.profile)).andExpect(status().isUnauthorized());
        send(incomplete,b.profile).andExpect(status().isConflict());
        send(a,a.profile).andExpect(status().isBadRequest());
        send(a,b.profile).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("pending"))
            .andExpect(jsonPath("$.direction").value("outgoing"));
        send(a,b.profile).andExpect(status().isOk());
        send(b,a.profile).andExpect(jsonPath("$.direction").value("incoming"));
        assertThat(connections.forProfile(a.profile)).hasSize(1);
        mvc.perform(get("/api/me/matches").cookie(a.cookie)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/conversations").cookie(b.cookie)).andExpect(content().json("[]"));
        message(a,b.profile,"Premature message").andExpect(status().isForbidden());
        call(a,b.profile).andExpect(status().isForbidden());
        action(a,b.profile,"accept").andExpect(status().isForbidden());
        action(a,b.profile,"decline").andExpect(status().isForbidden());
        action(b,a.profile,"cancel").andExpect(status().isForbidden());
        action(stranger,b.profile,"accept").andExpect(status().isNotFound());
        action(b,a.profile,"accept").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("accepted"));
        action(b,a.profile,"accept").andExpect(status().isOk());
        mvc.perform(get("/api/me/matches").cookie(a.cookie)).andExpect(jsonPath("$[0].id").value(b.profile));
        mvc.perform(get("/api/me/matches").cookie(b.cookie)).andExpect(jsonPath("$[0].id").value(a.profile));
        mvc.perform(get("/api/me/notifications").cookie(b.cookie)).andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test void bothPeopleShareMessagesWithCorrectDirectionUnreadCountsAndReadReceipts() throws Exception {
        User a=user(true),b=user(true),outsider=user(true); connect(a,b);
        var sent=message(a,b.profile,"Hello from A").andExpect(status().isOk()).andExpect(jsonPath("$.sender").value("visitor")).andReturn();
        long first=json.readTree(sent.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$[0].id").value(first)).andExpect(jsonPath("$[0].sender").value("member"));
        mvc.perform(get("/api/me/conversations").cookie(b.cookie)).andExpect(jsonPath("$[0].unreadCount").value(1));
        mvc.perform(post("/api/me/conversations/"+a.profile+"/read").cookie(b.cookie)).andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations").cookie(b.cookie)).andExpect(jsonPath("$[0].unreadCount").value(0));
        mvc.perform(get("/api/me/notifications").cookie(b.cookie)).andExpect(jsonPath("$.items[0].readAt").isNotEmpty());
        message(b,a.profile,"Reply from B").andExpect(jsonPath("$.sender").value("visitor"));
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages?afterId="+first).cookie(a.cookie))
            .andExpect(jsonPath("$[0].body").value("Reply from B")).andExpect(jsonPath("$[0].sender").value("member"));
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(a.cookie)).andExpect(jsonPath("$[0].readAt").isNotEmpty());
        message(outsider,b.profile,"Not allowed").andExpect(status().isForbidden());
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(outsider.cookie)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").cookie(a.cookie)).andExpect(status().isNoContent());
        Cookie fresh=mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("email",a.email,"password","Connection test password 42!"))))
            .andExpect(status().isOk()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(fresh)).andExpect(jsonPath("$.length()").value(2));
    }

    @Test void cancelDeclineAndRemovalCanOnlyBeReopenedByANewAcceptedRequestAndKeepHistory() throws Exception {
        User a=user(true),b=user(true); send(a,b.profile).andExpect(status().isOk());
        action(a,b.profile,"cancel").andExpect(jsonPath("$.status").value("cancelled"));
        action(a,b.profile,"cancel").andExpect(status().isOk());
        action(b,a.profile,"accept").andExpect(status().isConflict());
        send(a,b.profile).andExpect(status().isTooManyRequests()); age(a);
        send(a,b.profile).andExpect(status().isOk()); action(b,a.profile,"decline").andExpect(status().isOk()); age(a);
        send(b,a.profile).andExpect(jsonPath("$.direction").value("outgoing"));
        action(a,b.profile,"accept").andExpect(status().isOk());
        message(b,a.profile,"Keep this history").andExpect(status().isOk());
        action(a,b.profile,"remove").andExpect(jsonPath("$.status").value("removed"));
        mvc.perform(get("/api/me/matches").cookie(b.cookie)).andExpect(content().json("[]"));
        message(a,b.profile,"Closed thread").andExpect(status().isForbidden()); age(a);
        send(a,b.profile).andExpect(status().isOk()); message(a,b.profile,"Still pending").andExpect(status().isForbidden());
        action(b,a.profile,"accept").andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(a.cookie))
            .andExpect(jsonPath("$[0].body").value("Keep this history")).andExpect(jsonPath("$[0].sender").value("member"));
        assertThat(connections.forProfile(a.profile)).hasSize(1);
    }

    @Test void accountRecipientsCanAnswerCallsWithoutATeamKeyAndRemovalRevokesBothDirections() throws Exception {
        User a=user(true),b=user(true),other=user(true); connect(a,b);
        var result=call(a,b.profile).andExpect(status().isOk()).andReturn();
        String id=json.readTree(result.getResponse().getContentAsString()).get("id").asString();
        call(b,a.profile).andExpect(status().isConflict());
        mvc.perform(get("/api/me/calls").cookie(b.cookie)).andExpect(jsonPath("$[0].incoming").value(true))
            .andExpect(jsonPath("$[0].profileId").value(a.profile));
        callAction(a,id,"accept").andExpect(status().isForbidden());
        callAction(other,id,"accept").andExpect(status().isNotFound());
        callAction(b,id,"accept").andExpect(jsonPath("$.state").value("accepted"));
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(b.cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("payload","{\"candidate\":\"receiver candidate\"}")))).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/calls/"+id).cookie(a.cookie)).andExpect(jsonPath("$.signals[0].payload").value("{\"candidate\":\"receiver candidate\"}"));
        callAction(b,id,"end").andExpect(status().isOk());
        var reverse=call(b,a.profile).andExpect(status().isOk()).andReturn();
        String reverseId=json.readTree(reverse.getResponse().getContentAsString()).get("id").asString();
        action(a,b.profile,"remove").andExpect(status().isOk());
        mvc.perform(get("/api/me/calls").cookie(a.cookie)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/calls").cookie(b.cookie)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/calls/"+reverseId).cookie(a.cookie)).andExpect(status().isForbidden());
        call(a,b.profile).andExpect(status().isForbidden());
    }

    @Test void crossedConcurrentRequestsHaveOnePendingRecordAndNeverAutoAccept() throws Exception {
        User a=user(true),b=user(true); ExecutorService pool=Executors.newFixedThreadPool(4);
        try {
            List<Callable<Integer>> work=List.of(() -> send(a,b.profile).andReturn().getResponse().getStatus(),
                () -> send(b,a.profile).andReturn().getResponse().getStatus(),
                () -> send(a,b.profile).andReturn().getResponse().getStatus(),
                () -> send(b,a.profile).andReturn().getResponse().getStatus());
            for (Future<Integer> result : pool.invokeAll(work)) assertThat(result.get()).isEqualTo(200);
            assertThat(connections.forProfile(a.profile)).singleElement().satisfies(c -> assertThat(c.status).isEqualTo("pending"));
        } finally { pool.shutdownNow(); }
    }

    @Test void legacySwipeEndpointsCannotBypassConsentAndProfileDeletionRemovesTheConnection() throws Exception {
        User a=user(true),b=user(true);
        mvc.perform(put("/api/me/swipes/"+b.profile).cookie(a.cookie).contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"super_like\"}"))
            .andExpect(jsonPath("$.matched").value(false)).andExpect(jsonPath("$.status").value("pending"));
        message(a,b.profile,"Bypass attempt").andExpect(status().isForbidden());
        action(b,a.profile,"accept").andExpect(status().isOk());
        mvc.perform(put("/api/me/swipes/"+b.profile).cookie(a.cookie).contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"pass\"}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/me/matches").cookie(a.cookie)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(delete("/api/profiles/"+b.profile).cookie(b.cookie)).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/connections").cookie(a.cookie)).andExpect(content().json("[]"));
        mvc.perform(get("/api/auth/me").cookie(b.cookie)).andExpect(jsonPath("$.user.profileId").isEmpty());
    }

    @Test void anUnclaimedPortfolioRequestWaitsForItsOwnerAndAppearsWhenTheAccountIsLinked() throws Exception {
        User a=user(true),owner=user(false);
        send(a,"fontelar-dave").andExpect(jsonPath("$.status").value("pending"))
            .andExpect(jsonPath("$.ownerAvailable").value(false));
        Account linked=accounts.findByEmail(owner.email).orElseThrow();linked.profileId="fontelar-dave";accounts.saveAndFlush(linked);
        mvc.perform(get("/api/me/connections").cookie(owner.cookie)).andExpect(jsonPath("$[0].direction").value("incoming"));
        action(owner,a.profile,"accept").andExpect(status().isOk());
        mvc.perform(get("/api/me/connections").cookie(a.cookie)).andExpect(jsonPath("$[0].ownerAvailable").value(true))
            .andExpect(jsonPath("$[0].status").value("accepted"));
    }

    @Test void concurrentLegacySwipeRetriesAlsoCreateOnlyOnePendingRequest() throws Exception {
        User a=user(true),b=user(true);ExecutorService pool=Executors.newFixedThreadPool(4);
        try {
            List<Callable<Integer>> work=new ArrayList<>();
            for (int i=0;i<4;i++) work.add(() -> mvc.perform(put("/api/me/swipes/"+b.profile).cookie(a.cookie)
                .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"like\"}")).andReturn().getResponse().getStatus());
            for (Future<Integer> result : pool.invokeAll(work)) assertThat(result.get()).isEqualTo(200);
            assertThat(connections.forProfile(a.profile)).hasSize(1);
            mvc.perform(get("/api/me/matches").cookie(a.cookie)).andExpect(content().json("[]"));
        } finally {pool.shutdownNow();}
    }

    @Test void loggingOutTheRecipientEndsTheIncomingCallWithoutRemovingTheConnection() throws Exception {
        User a=user(true),b=user(true);connect(a,b);
        var result=call(a,b.profile).andExpect(status().isOk()).andReturn();
        String id=json.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(post("/api/auth/logout").cookie(b.cookie)).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/calls/"+id).cookie(a.cookie)).andExpect(jsonPath("$.state").value("ended"));
        mvc.perform(get("/api/me/matches").cookie(a.cookie)).andExpect(jsonPath("$.length()").value(1));
    }

    @Test void answeredCallsPersistOneSharedEventWithDurationAndCorrectDirection() throws Exception {
        User a=user(true),b=user(true);connect(a,b);
        String id=json.readTree(call(b,a.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        callAction(a,id,"accept").andExpect(status().isOk());
        jdbc.update("update video_calls set accepted_at = ? where id = ?",java.time.Instant.now().minusSeconds(65),id);
        callAction(b,id,"end").andExpect(status().isOk());
        callAction(a,id,"end").andExpect(status().isOk()); callHistory.sweep();
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].body").value("Call ended"))
            .andExpect(jsonPath("$[0].sender").value("visitor")).andExpect(jsonPath("$[0].call.state").value("ended"))
            .andExpect(jsonPath("$[0].call.durationSeconds").value(org.hamcrest.Matchers.greaterThanOrEqualTo(65)));
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(a.cookie))
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].sender").value("member"));
        mvc.perform(get("/api/me/conversations").cookie(a.cookie))
            .andExpect(jsonPath("$[0].lastMessage.body").value("Call ended"));
    }

    @Test void unansweredInvitationsExpireIntoMissedMessagesWithoutEitherBrowserOpen() throws Exception {
        User a=user(true),b=user(true);connect(a,b);
        String id=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        jdbc.update("update video_calls set created_at = ? where id = ?",java.time.Instant.now().minusSeconds(100),id);
        callHistory.sweep();callHistory.sweep();
        mvc.perform(get("/api/me/calls/"+id).cookie(a.cookie)).andExpect(jsonPath("$.state").value("missed"));
        mvc.perform(get("/api/me/calls").cookie(b.cookie)).andExpect(content().json("[]"));
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].body").value("Missed call"))
            .andExpect(jsonPath("$[0].call.state").value("missed")).andExpect(jsonPath("$[0].call.durationSeconds").isEmpty());
        mvc.perform(get("/api/me/conversations").cookie(b.cookie)).andExpect(jsonPath("$[0].unreadCount").value(1));
        mvc.perform(get("/api/me/notifications").cookie(b.cookie)).andExpect(jsonPath("$.items[0].body").value("Missed call"));
    }

    @Test void declinedAndCancelledCallsAreRecordedAndUnrelatedPeopleCannotFabricateEvents() throws Exception {
        User a=user(true),b=user(true),other=user(true);connect(a,b);
        String id=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        callAction(other,id,"end").andExpect(status().isNotFound());
        callAction(b,id,"decline").andExpect(status().isOk());
        String cancelled=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        callAction(a,cancelled,"end").andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(b.cookie))
            .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].call.state").value("declined"))
            .andExpect(jsonPath("$[1].call.state").value("missed"));
        mvc.perform(get("/api/me/conversations/"+a.profile+"/messages").cookie(other.cookie)).andExpect(status().isForbidden());
    }

    @Test void concurrentHangupsAndDisconnectedCallsProduceOnlyOneEvent() throws Exception {
        User a=user(true),b=user(true);connect(a,b);
        String id=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        callAction(b,id,"accept").andExpect(status().isOk());
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> work=List.of(() -> callAction(a,id,"end").andReturn().getResponse().getStatus(),
                () -> callAction(b,id,"end").andReturn().getResponse().getStatus());
            for (Future<Integer> result : pool.invokeAll(work)) assertThat(result.get()).isEqualTo(200);
        } finally { pool.shutdownNow(); }
        String disconnected=json.readTree(call(b,a.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        callAction(a,disconnected,"accept").andExpect(status().isOk());
        jdbc.update("update video_calls set accepted_at = ?, visitor_heartbeat = ? where id = ?",
            java.time.Instant.now().minusSeconds(120),java.time.Instant.now().minusSeconds(70),disconnected);
        callHistory.sweep();callHistory.sweep();
        assertThat(jdbc.queryForObject("select count(*) from messages where call_id = ?",Long.class,id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from messages where call_id = ?",Long.class,disconnected)).isEqualTo(1);
        mvc.perform(get("/api/me/conversations/"+b.profile+"/messages").cookie(a.cookie))
            .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[1].call.state").value("ended"));
    }

    @Test void candidateBatchesAreAuthorizedAtomicAndSupportIncrementalReads() throws Exception {
        User a=user(true),b=user(true),other=user(true);connect(a,b);
        String id=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        List<String> payloads=List.of("{\"candidate\":\"first\"}","{\"candidate\":\"second\"}");
        String batch=json.writeValueAsString(Map.of("payloads",payloads));
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(other.cookie).contentType(MediaType.APPLICATION_JSON).content(batch))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON).content(batch))
            .andExpect(status().isNoContent());
        var response=mvc.perform(get("/api/me/calls/"+id).cookie(b.cookie)).andExpect(jsonPath("$.signals.length()").value(2)).andReturn();
        long cursor=json.readTree(response.getResponse().getContentAsString()).get("signals").get(1).get("id").asLong();
        mvc.perform(get("/api/me/calls/"+id+"?afterSignalId="+cursor).cookie(b.cookie)).andExpect(jsonPath("$.signals.length()").value(0));
        mvc.perform(get("/api/me/calls/"+id).cookie(a.cookie)).andExpect(jsonPath("$.signals.length()").value(0));
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("payloads",List.of(payloads.get(0),"{}"))))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("payload",payloads.get(0))))).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/calls/"+id+"?afterSignalId="+cursor).cookie(b.cookie)).andExpect(jsonPath("$.signals.length()").value(1));
        callAction(a,id,"end").andExpect(status().isOk());
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(b.cookie).contentType(MediaType.APPLICATION_JSON).content(batch))
            .andExpect(status().isConflict());
    }

    @Test void batchLimitsCannotBypassThePerCallerCandidateQuota() throws Exception {
        User a=user(true),b=user(true);connect(a,b);
        String id=json.readTree(call(a,b.profile).andReturn().getResponse().getContentAsString()).get("id").asString();
        String payload="{\"candidate\":\"test\"}";
        for (Map<String,Object> invalid : List.<Map<String,Object>>of(Map.of(),Map.of("payloads",List.of()),
            Map.of("payloads",Collections.nCopies(21,payload)),Map.of("payload",payload,"payloads",List.of(payload))))
            mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(invalid))).andExpect(status().isBadRequest());
        String full=json.writeValueAsString(Map.of("payloads",Collections.nCopies(20,payload)));
        for (int i=0;i<4;i++)mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON).content(full))
            .andExpect(status().isNoContent());
        mvc.perform(post("/api/me/calls/"+id+"/candidates").cookie(a.cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("payloads",List.of(payload))))).andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/me/calls/"+id).cookie(b.cookie)).andExpect(jsonPath("$.signals.length()").value(80));
    }

    private User user(boolean profile) throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        Cookie cookie=mvc.perform(post("/api/auth/register").with(r -> {r.setRemoteAddr(email);return r;})
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("name","Connection User","email",email,
                "password","Connection test password 42!","confirmPassword","Connection test password 42!"))))
            .andExpect(status().isCreated()).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
        String id=null;
        if (profile) id=json.readTree(mvc.perform(post("/api/profiles").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("name","Developer "+UUID.randomUUID(),"age",22))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        return new User(cookie,id,email);
    }
    private ResultActions send(User from,String target) throws Exception { return mvc.perform(post("/api/me/connection-requests/"+target).cookie(from.cookie)); }
    private ResultActions action(User from,String target,String action) throws Exception { return mvc.perform(post("/api/me/connections/"+target+"/action")
        .cookie(from.cookie).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("action",action)))); }
    private void connect(User a,User b) throws Exception { send(a,b.profile).andExpect(status().isOk()); action(b,a.profile,"accept").andExpect(status().isOk()); }
    private ResultActions message(User from,String target,String body) throws Exception { return mvc.perform(post("/api/me/conversations/"+target+"/messages")
        .cookie(from.cookie).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("body",body)))); }
    private ResultActions call(User from,String target) throws Exception { return mvc.perform(post("/api/me/calls").cookie(from.cookie)
        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("profileId",target,"offer","v=0\r\n")))); }
    private ResultActions callAction(User from,String id,String action) throws Exception { return mvc.perform(post("/api/me/calls/"+id+"/action")
        .cookie(from.cookie).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("action",action,"answer","v=0\r\n")))); }
    private void age(User user) { jdbc.update("update connections set updated_at = ? where low_profile_id = ? or high_profile_id = ?",
        java.time.Instant.now().minusSeconds(120),user.profile,user.profile); }
}
