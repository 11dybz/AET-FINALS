package com.pitchr.backend;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class PortfolioController {
    static final String COOKIE = "PITCHR_SESSION";
    private final PortfolioService service;
    private final String teamEmail;
    private final boolean secureCookie;

    public PortfolioController(PortfolioService service, @Value("${pitchr.team-email}") String teamEmail,
                               @Value("${pitchr.cookie-secure}") boolean secureCookie) {
        this.service = service;
        this.teamEmail = teamEmail;
        this.secureCookie = secureCookie;
    }

    @GetMapping("/profiles")
    public List<ProfileResponse> profiles() { return service.profiles(); }

    @GetMapping("/profiles/{id}")
    public ProfileResponse profile(@PathVariable String id) { return service.profile(id); }

    @PostMapping("/session")
    public ResponseEntity<SessionResponse> session(@CookieValue(name = COOKIE, required = false) String token) {
        VisitorSession session = service.resumeSession(token);
        ResponseCookie cookie = ResponseCookie.from(COOKIE, session.id).httpOnly(true).secure(secureCookie)
            .sameSite("Lax").path("/api")
            .maxAge(Duration.between(Instant.now(), session.expiresAt)).build();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new SessionResponse(session.expiresAt));
    }

    @GetMapping("/me/matches")
    public List<ProfileResponse> matches(@CookieValue(name = COOKIE, required = false) String token) {
        return service.matches(token);
    }

    @PutMapping(value = "/me/swipes/{profileId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PortfolioService.SwipeResult swipe(@CookieValue(name = COOKIE, required = false) String token,
            @PathVariable String profileId, @Valid @RequestBody SwipeRequest request) {
        return service.swipe(token, profileId, request.action());
    }

    @GetMapping("/team")
    public Map<String, String> team() { return Map.of("name", "pitchr.", "email", teamEmail); }

    public record SwipeRequest(@NotNull Swipe.Action action) {}
    public record SessionResponse(Instant expiresAt) {}
}
