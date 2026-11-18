package com.pitchr.backend;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccountService accounts;
    private final boolean secure;
    private final Set<String> allowedOrigins;
    private final Map<String, Deque<Instant>> attempts = new LinkedHashMap<>();
    AuthController(AccountService accounts, @Value("${pitchr.cookie-secure:false}") boolean secure,
        @Value("${pitchr.allowed-origins:}") String origins) {
        this.accounts = accounts; this.secure = secure;
        this.allowedOrigins = new HashSet<>(Arrays.asList(origins.split(",")));
    }
    @GetMapping("/me")
    public AccountService.AuthResponse me(@CookieValue(name=PortfolioController.COOKIE, required=false) String token) { return accounts.me(token); }

    @PostMapping(value="/register", consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountService.AuthResponse> register(@Valid @RequestBody RegisterRequest body,
        @CookieValue(name=PortfolioController.COOKIE, required=false) String token, HttpServletRequest request) {
        origin(request); throttle(request.getRemoteAddr());
        try { return signedIn(accounts.register(body.name(), body.email(), body.password(), body.confirmPassword(), token), HttpStatus.CREATED); }
        catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists. Please log in.");
        }
    }
    @PostMapping(value="/login", consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountService.AuthResponse> login(@Valid @RequestBody LoginRequest body,
        @CookieValue(name=PortfolioController.COOKIE, required=false) String token, HttpServletRequest request) {
        origin(request); throttle(request.getRemoteAddr());
        return signedIn(accounts.login(body.email(), body.password(), token), HttpStatus.OK);
    }
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name=PortfolioController.COOKIE, required=false) String token, HttpServletRequest request) {
        origin(request); accounts.logout(token);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO)).build();
    }
    private ResponseEntity<AccountService.AuthResponse> signedIn(AccountService.Login login, HttpStatus status) {
        return ResponseEntity.status(status).header(HttpHeaders.SET_COOKIE,
            cookie(login.token(), Duration.between(Instant.now(), login.response().expiresAt()))).body(login.response());
    }
    private String cookie(String value, Duration age) {
        return ResponseCookie.from(PortfolioController.COOKIE, value).httpOnly(true).secure(secure).sameSite("Lax")
            .path("/api").maxAge(age).build().toString();
    }
    private void origin(HttpServletRequest request) {
        String origin = request.getHeader("Origin"); if (origin == null) return;
        boolean same = false;
        try { URI parsed = URI.create(origin); same = Set.of("https", "http").contains(parsed.getScheme())
            && parsed.getRawAuthority() != null && parsed.getRawAuthority().equalsIgnoreCase(request.getHeader("Host")); }
        catch (IllegalArgumentException ignored) {}
        if (!same && !allowedOrigins.contains(origin)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This origin is not allowed.");
    }
    private synchronized void throttle(String ip) {
        Instant now = Instant.now(), cutoff = now.minusSeconds(600);
        attempts.entrySet().removeIf(e -> e.getValue().isEmpty() || e.getValue().getLast().isBefore(cutoff));
        if (!attempts.containsKey(ip) && attempts.size() >= 5000) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Please try again in a few minutes.");
        Deque<Instant> window = attempts.computeIfAbsent(ip, key -> new ArrayDeque<>());
        while (!window.isEmpty() && window.peekFirst().isBefore(cutoff)) window.removeFirst();
        if (window.size() >= 20) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please try again in a few minutes.");
        window.addLast(now);
    }
    public record RegisterRequest(@NotBlank @Size(max=100) String name,
        @NotBlank @Email @Size(max=254) String email, @NotBlank @Size(min=10,max=128) String password,
        @NotBlank @Size(max=128) String confirmPassword) {}
    public record LoginRequest(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=128) String password) {}
}
