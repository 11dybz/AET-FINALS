package com.pitchr.backend;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class AccountService {
    private final AccountRepository accounts;
    private final AccountSessionRepository authSessions;
    private final SessionRepository workspaces;
    private final VideoCallRepository calls;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash = PasswordHasher.hash("dummy-" + UUID.randomUUID());

    AccountService(AccountRepository accounts, AccountSessionRepository authSessions, SessionRepository workspaces, VideoCallRepository calls) {
        this.accounts = accounts; this.authSessions = authSessions; this.workspaces = workspaces;
        this.calls = calls;
    }
    public Login register(String name, String email, String password, String confirmation, String previousToken) {
        if (!password.equals(confirmation)) throw error(HttpStatus.BAD_REQUEST, "Passwords do not match.");
        String displayName = name.strip();
        if (displayName.isBlank()) throw error(HttpStatus.BAD_REQUEST, "Enter your name.");
        String normalized = normalize(email);
        if (accounts.findByEmail(normalized).isPresent()) throw error(HttpStatus.CONFLICT, "An account with this email already exists. Please log in.");
        Instant now = Instant.now();
        // New workspace and fresh cookie prevent an old anonymous cookie from becoming an account credential.
        VisitorSession workspace = workspaces.save(new VisitorSession(UUID.randomUUID().toString(), now.plus(Duration.ofDays(30))));
        Account account = new Account(); account.id = UUID.randomUUID().toString(); account.displayName = displayName;
        account.email = normalized; account.passwordHash = PasswordHasher.hash(password); account.workspaceId = workspace.id;
        account.createdAt = now; accounts.saveAndFlush(account);
        return issue(account, previousToken);
    }
    public Login login(String email, String password, String previousToken) {
        Optional<Account> found = accounts.findByEmail(normalize(email));
        boolean correct = PasswordHasher.matches(password, found.map(a -> a.passwordHash).orElse(dummyHash));
        if (found.isEmpty() || !correct) throw error(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        return issue(found.get(), previousToken);
    }
    private Login issue(Account account, String previousToken) {
        Instant now = Instant.now();
        VisitorSession workspace = workspaces.findForUpdate(account.workspaceId).orElseThrow();
        workspace.expiresAt = now.plus(Duration.ofDays(30));
        logout(previousToken);
        authSessions.deleteByAccountIdAndExpiresAtBefore(account.id, now);
        byte[] secret = new byte[32]; random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        AccountSession session = new AccountSession(); session.id = digest(token); session.accountId = account.id;
        session.createdAt = now; session.expiresAt = now.plus(Duration.ofDays(7)); authSessions.save(session);
        return new Login(token, new AuthResponse(true, user(account), session.expiresAt));
    }
    @Transactional(readOnly = true)
    public AuthResponse me(String token) {
        Optional<AccountSession> session = authentication(token);
        if (session.isEmpty()) return new AuthResponse(false, null, null);
        return accounts.findById(session.get().accountId).map(a -> new AuthResponse(true, user(a), session.get().expiresAt))
            .orElseGet(() -> new AuthResponse(false, null, null));
    }
    public void logout(String token) {
        if (token == null || token.length() > 128) return;
        authSessions.findById(digest(token)).ifPresent(session -> {
            if (session.expiresAt.isAfter(Instant.now())) accounts.findById(session.accountId)
                .ifPresent(account -> {
                    calls.endWorkspaceCalls(account.workspaceId);
                    if (account.profileId != null) calls.endProfileCalls(account.profileId);
                });
            authSessions.delete(session);
        });
    }
    /** Resolve fresh login tokens to a stable workspace; direct access to an account workspace is forbidden. */
    public Optional<VisitorSession> resolve(String token, boolean lock) {
        if (token == null || token.isBlank() || token.length() > 128) return Optional.empty();
        Optional<AccountSession> auth = authentication(token);
        String workspace = auth.flatMap(s -> accounts.findById(s.accountId)).map(a -> a.workspaceId).orElse(token);
        if (auth.isEmpty() && accounts.existsByWorkspaceId(workspace)) return Optional.empty();
        return (lock ? workspaces.findForUpdate(workspace) : workspaces.findById(workspace))
            .map(s -> (VisitorSession) org.hibernate.Hibernate.unproxy(s))
            .filter(s -> s.expiresAt.isAfter(Instant.now()));
    }
    @Transactional(readOnly = true)
    public Instant expiry(String token, Instant fallback) { return authentication(token).map(s -> s.expiresAt).orElse(fallback); }
    private Optional<AccountSession> authentication(String token) {
        if (token == null || token.isBlank() || token.length() > 128) return Optional.empty();
        return authSessions.findById(digest(token)).filter(s -> s.expiresAt.isAfter(Instant.now()));
    }
    private String digest(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private String normalize(String email) { return email.strip().toLowerCase(Locale.ROOT); }
    public Account requireAccount(String token) {
        return authentication(token).flatMap(s -> accounts.findById(s.accountId))
            .orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Log in to manage your profile."));
    }
    public Account lockForProfileCreation(String token) {
        String id = authentication(token).map(s -> s.accountId)
            .orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Log in to create your profile."));
        Account account = accounts.lockForUpdate(id).orElseThrow();
        if (account.profileId != null) throw error(HttpStatus.CONFLICT, "You already have a profile. Edit your existing profile instead.");
        return account;
    }
    public void requireProfileOwner(String token, String profileId) {
        Account account = requireAccount(token);
        if (!Objects.equals(account.profileId, profileId))
            throw error(HttpStatus.FORBIDDEN, "You can only edit your own profile.");
    }
    public String profileIdForWorkspace(String workspaceId) {
        return accounts.findByWorkspaceId(workspaceId).map(account -> account.profileId).orElse(null);
    }
    public boolean ownsWorkspaceProfile(String workspaceId, String profileId) {
        return profileId != null && accounts.existsByWorkspaceIdAndProfileId(workspaceId, profileId);
    }
    private User user(Account account) { return new User(account.id, account.displayName, account.email, account.profileId); }
    private ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
    public record User(String id, String name, String email, String profileId) {}
    public record AuthResponse(boolean authenticated, User user, Instant expiresAt) {}
    public record Login(String token, AuthResponse response) {}
}
