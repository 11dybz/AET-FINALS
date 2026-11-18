package com.pitchr.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.*;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.web.ServletTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK,properties={
    "spring.datasource.url=jdbc:h2:mem:closed-profile-writes;DB_CLOSE_DELAY=-1", "pitchr.admin-key="
})
@AutoConfigureMockMvc
@TestExecutionListeners(listeners={ServletTestExecutionListener.class,DependencyInjectionTestExecutionListener.class},inheritListeners=false)
class PublicProfileWriteTests {
    @Autowired MockMvc mvc;
    @Test void blankAdminKeyDoesNotAllowAnonymousOrLegacyGuestProfileWrites() throws Exception {
        var guest=mvc.perform(post("/api/session")).andReturn().getResponse().getCookie(PortfolioController.COOKIE);
        String profile="/api/profiles/chee-reynaldo", payload="{\"name\":\"Attempted overwrite\",\"age\":25}";
        mvc.perform(put(profile).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(put(profile).cookie(guest).header("X-Admin-Key","forged").contentType(MediaType.APPLICATION_JSON)
            .content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/profiles").cookie(guest).contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(delete(profile).cookie(guest)).andExpect(status().isUnauthorized());
        mvc.perform(post(profile+"/images").cookie(guest).contentType(MediaType.APPLICATION_JSON)
            .content("{\"url\":\"https://example.com/photo.png\"}")).andExpect(status().isUnauthorized());
        mvc.perform(delete(profile+"/images/1").cookie(guest)).andExpect(status().isUnauthorized());
        mvc.perform(put(profile+"/images/order").cookie(guest).contentType(MediaType.APPLICATION_JSON)
            .content("{\"imageIds\":[1]}")).andExpect(status().isUnauthorized());
        mvc.perform(get(profile)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("CHEE, Reynaldo Joseph"));
    }
}
