package com.pitchr.backend;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CollaborationController {
    private final CollaborationService service;
    private final PortfolioController access;
    private final String turnUrl, turnUser, turnPassword;
    private final boolean callingEnabled;

    CollaborationController(CollaborationService service, PortfolioController access,
        @Value("${rizzume.turn-url:}") String turnUrl, @Value("${rizzume.turn-user:}") String turnUser,
        @Value("${rizzume.turn-password:}") String turnPassword,
        @Value("${pitchr.team-inbox-key:}") String teamKey) {
        this.service = service; this.access = access; this.turnUrl = turnUrl;
        this.turnUser = turnUser; this.turnPassword = turnPassword;
        this.callingEnabled = !teamKey.isBlank();
    }

    @GetMapping("/me/notifications")
    public Map<String, Object> notifications(@CookieValue(name = PortfolioController.COOKIE, required = false) String token) {
        return service.notifications(token);
    }
    @PostMapping("/me/notifications/read")
    public ResponseEntity<Void> read(@CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @Valid @RequestBody ReadRequest request) {
        service.read(token, request.throughId()); return ResponseEntity.noContent().build();
    }
    @GetMapping({"/me/call-config", "/team/call-config"})
    public Map<String, Object> config(jakarta.servlet.http.HttpServletRequest request,
        @RequestHeader(value = "X-Team-Key", required = false) String key,
        @CookieValue(name = PortfolioController.COOKIE, required = false) String token) {
        if (request.getRequestURI().contains("/team/")) access.requireTeamKey(key);
        else service.active(token, null, false);
        List<Map<String, Object>> servers = new ArrayList<>();
        servers.add(Map.of("urls", "stun:stun.l.google.com:19302"));
        if (!turnUrl.isBlank()) servers.add(Map.of("urls", turnUrl, "username", turnUser, "credential", turnPassword));
        return Map.of("iceServers", servers, "relayConfigured", !turnUrl.isBlank(), "callingEnabled", callingEnabled);
    }
    @PostMapping("/me/calls")
    public CollaborationService.CallView start(@CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @Valid @RequestBody StartRequest request) {
        if (!callingEnabled) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Video calls are not configured yet. The team can enable its workspace to receive calls.");
        return service.start(token, request.profileId(), request.offer());
    }

    @GetMapping("/me/calls")
    public List<CollaborationService.CallSummary> active(@CookieValue(name = PortfolioController.COOKIE, required = false) String token) {
        return service.active(token, null, false);
    }
    @GetMapping("/team/calls")
    public List<CollaborationService.CallSummary> teamActive(@RequestHeader(value = "X-Team-Key", required = false) String key,
        @RequestParam String profileId) { access.requireTeamKey(key); return service.active(null, profileId, true); }

    @GetMapping({"/me/calls/{id}", "/team/calls/{id}"})
    public CollaborationService.CallView get(@PathVariable String id, jakarta.servlet.http.HttpServletRequest request,
        @CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @RequestHeader(value = "X-Team-Key", required = false) String key) {
        return service.get(token, id, team(request, key));
    }
    @PostMapping({"/me/calls/{id}/action", "/team/calls/{id}/action"})
    public CollaborationService.CallView action(@PathVariable String id, jakarta.servlet.http.HttpServletRequest request,
        @CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @RequestHeader(value = "X-Team-Key", required = false) String key, @Valid @RequestBody ActionRequest body) {
        return service.action(token, id, team(request, key), body.action(), body.answer());
    }
    @PostMapping({"/me/calls/{id}/candidates", "/team/calls/{id}/candidates"})
    public ResponseEntity<Void> candidate(@PathVariable String id, jakarta.servlet.http.HttpServletRequest request,
        @CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @RequestHeader(value = "X-Team-Key", required = false) String key, @Valid @RequestBody CandidateRequest body) {
        service.candidate(token, id, team(request, key), body.payload()); return ResponseEntity.noContent().build();
    }
    private boolean team(jakarta.servlet.http.HttpServletRequest request, String key) {
        boolean team = request.getRequestURI().contains("/team/");
        if (team) access.requireTeamKey(key); return team;
    }
    public record ReadRequest(@PositiveOrZero long throughId) {}
    public record StartRequest(@NotBlank @Size(max=255) String profileId, @NotBlank @Size(max=16000) String offer) {}
    public record ActionRequest(@NotBlank @Pattern(regexp="accept|decline|end") String action, @Size(max=16000) String answer) {}
    public record CandidateRequest(@NotBlank @Size(max=4000) String payload) {}
}
