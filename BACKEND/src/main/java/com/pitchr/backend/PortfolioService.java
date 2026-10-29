package com.pitchr.backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class PortfolioService {
    private final ProfileRepository profiles;
    private final SessionRepository sessions;
    private final SwipeRepository swipes;
    private final int sessionDays;

    public PortfolioService(ProfileRepository profiles, SessionRepository sessions, SwipeRepository swipes,
                            @Value("${pitchr.session-days}") int sessionDays) {
        this.profiles = profiles;
        this.sessions = sessions;
        this.swipes = swipes;
        this.sessionDays = sessionDays;
    }

    public List<ProfileResponse> profiles() {
        return profiles.findAllByOrderByDisplayOrderAsc().stream().map(ProfileResponse::from).toList();
    }

    public ProfileResponse profile(String id) { return ProfileResponse.from(requireProfile(id)); }

    @Transactional
    public VisitorSession resumeSession(String token) {
        if (token != null) {
            var existing = sessions.findById(token).filter(s -> s.expiresAt.isAfter(Instant.now()));
            if (existing.isPresent()) return existing.get();
        }
        return sessions.save(new VisitorSession(UUID.randomUUID().toString(),
            Instant.now().truncatedTo(ChronoUnit.SECONDS).plus(sessionDays, ChronoUnit.DAYS)));
    }

    public List<ProfileResponse> matches(String token) {
        VisitorSession session = requireSession(token, false);
        return swipes.findBySessionIdOrderByCreatedAtAscIdAsc(session.id).stream()
            .filter(s -> s.action != Swipe.Action.pass)
            .map(s -> ProfileResponse.from(s.profile, s.action == Swipe.Action.super_like)).toList();
    }

    @Transactional
    public SwipeResult swipe(String token, String profileId, Swipe.Action action) {
        // Serialize writes for this visitor so simultaneous requests cannot create duplicates.
        VisitorSession session = requireSession(token, true);
        Profile profile = requireProfile(profileId);
        Swipe swipe = swipes.findBySessionIdAndProfileId(session.id, profile.id).orElseGet(() -> {
            Swipe created = new Swipe();
            created.session = session;
            created.profile = profile;
            created.createdAt = Instant.now();
            return created;
        });
        swipe.action = action;
        swipe.updatedAt = Instant.now();
        swipes.save(swipe);
        return new SwipeResult(profileId, action, action != Swipe.Action.pass, action == Swipe.Action.super_like);
    }

    private Profile requireProfile(String id) {
        return profiles.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found"));
    }

    private VisitorSession requireSession(String token, boolean lock) {
        if (token == null || token.isBlank()) throw unauthorized();
        return (lock ? sessions.findForUpdate(token) : sessions.findById(token))
            .filter(s -> s.expiresAt.isAfter(Instant.now())).orElseThrow(this::unauthorized);
    }

    private ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Create or resume a visitor session first");
    }

    public record SwipeResult(String profileId, Swipe.Action action, boolean matched, boolean isSuper) {}
}
