package com.pitchr.backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.net.URI;
import java.text.Normalizer;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Transactional(readOnly = true)
public class PortfolioService {
    private static final int MAX_IMAGES = 8;
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private final ProfileRepository profiles;
    private final SessionRepository sessions;
    private final SwipeRepository swipes;
    private final int sessionDays;
    private final Map<String, Deque<Instant>> sendWindows = new ConcurrentHashMap<>();

    public PortfolioService(ProfileRepository profiles, SessionRepository sessions, SwipeRepository swipes,
                            @Value("${pitchr.session-days}") int sessionDays) {
        this.profiles = profiles;
        this.sessions = sessions;
        this.swipes = swipes;
        this.sessionDays = sessionDays;
    }

    /** Return profile DTOs with ordered metadata only; image blobs are never joined or selected here. */
    public List<ProfileResponse> profiles() {
        return profiles.findAllByOrderByDisplayOrderAsc().stream()
            .map(profile -> response(profile, null)).toList();
    }

    /** Return a single profile through the same mapping path used by list and matches responses. */
    public ProfileResponse profile(String id) { return response(requireProfile(id), null); }

    /** Create a profile with a server-owned unique slug and an append-only display position. */
    @Transactional
    public ProfileResponse createProfile(ProfileRequest request) {
        Profile profile = new Profile();
        profile.id = uniqueSlug(request.name());
        profile.displayOrder = profiles.findAllByOrderByDisplayOrderAsc().stream()
            .mapToInt(existing -> existing.displayOrder).max().orElse(-1) + 1;
        applyEditableFields(profile, request);
        return response(profiles.saveAndFlush(profile), null);
    }

    /** Replace all editable profile fields while keeping the immutable slug and display position. */
    @Transactional
    public ProfileResponse updateProfile(String id, ProfileRequest request) {
        Profile profile = requireProfile(id);
        applyEditableFields(profile, request);
        return response(profiles.saveAndFlush(profile), null);
    }

    /** Delete references that lack database cascades before deleting the profile in one transaction. */
    @Transactional
    public void deleteProfile(String id) {
        Profile profile = requireProfile(id);
        swipes.deleteAllByProfileId(id);
        // Hibernate removes profile_skills, profile_highlights, and projects through the mapped element collections.
        // This also respects the configured schema under both H2 and the Supabase `pitchr` schema.
        // V3 has ON DELETE CASCADE from profiles -> profile_images -> profile_image_blobs.
        profiles.delete(profile);
    }

    /** Add one or more server-validated uploads and persist each binary separately from its metadata. */
    @Transactional
    public List<ProfileResponse.Image> addImageFiles(String profileId, List<MultipartFile> files) {
        requireProfile(profileId);
        if (files == null || files.isEmpty()) throw badRequest("Select at least one image file");
        long existing = images.countByProfileId(profileId);
        if (existing + files.size() > MAX_IMAGES) throw badRequest("A profile can have at most 8 images");
        List<ProfileResponse.Image> added = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) throw badRequest("An uploaded image is empty");
            if (file.getSize() > MAX_IMAGE_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "Each image must be 5 MB or smaller");
            try {
                byte[] bytes = file.getBytes();
                String contentType = detectImageType(bytes);
                ProfileImage image = images.saveAndFlush(new ProfileImage(profileId,
                    (int) existing++, null, contentType, (long) bytes.length));
                imageBlobs.save(new ProfileImageBlob(image.id, bytes));
                added.add(new ProfileResponse.Image(image.id, "/api/images/" + image.id));
            } catch (IOException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read uploaded image", ex);
            }
        }
        refreshCover(profileId);
        return List.copyOf(added);
    }

    /** Add a validated http(s) URL as gallery metadata without downloading or proxying remote content. */
    @Transactional
    public List<ProfileResponse.Image> addImageUrl(String profileId, String url) {
        requireProfile(profileId);
        validateHttpUrl(url, "image URL");
        if (images.countByProfileId(profileId) >= MAX_IMAGES) throw badRequest("A profile can have at most 8 images");
        int order = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId).size();
        ProfileImage image = images.saveAndFlush(new ProfileImage(profileId, order, url, null, null));
        refreshCover(profileId);
        return List.of(new ProfileResponse.Image(image.id, url));
    }

    /** Remove one image only when it belongs to the requested profile, then compact order and cover. */
    @Transactional
    public void deleteImage(String profileId, Long imageId) {
        requireProfile(profileId);
        ProfileImage image = images.findById(imageId).filter(row -> row.profileId.equals(profileId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        images.delete(image);
        normalizeImageOrder(profileId);
        refreshCover(profileId);
    }

    /** Reorder all gallery items atomically; partial, duplicate, foreign, or stale id lists are rejected. */
    @Transactional
    public void reorderImages(String profileId, List<Long> imageIds) {
        requireProfile(profileId);
        List<ProfileImage> current = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId);
        if (imageIds == null || imageIds.size() != current.size()
            || new HashSet<>(imageIds).size() != current.size()) {
            throw badRequest("imageIds must contain every current image id exactly once");
        }
        Set<Long> currentIds = current.stream().map(row -> row.id).collect(java.util.stream.Collectors.toSet());
        if (!currentIds.equals(new HashSet<>(imageIds))) {
            throw badRequest("imageIds must contain only images belonging to this profile");
        }
        for (int index = 0; index < imageIds.size(); index++) {
            final int order = index;
            Long imageId = imageIds.get(index);
            current.stream().filter(row -> row.id.equals(imageId)).findFirst().orElseThrow().displayOrder = order;
        }
        images.saveAll(current);
        refreshCover(profileId);
    }

    /** Fetch one uploaded blob for streaming; source-URL images intentionally have no blob row. */
    public ImagePayload image(Long id) {
        ProfileImage metadata = images.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        ProfileImageBlob blob = imageBlobs.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Uploaded image data not found"));
        return new ImagePayload(metadata.contentType, blob.data);
    }

    /** Existing anonymous session behavior is unchanged. */
    @Transactional
    public VisitorSession resumeSession(String token) {
        if (token != null) {
            var existing = sessions.findById(token).filter(s -> s.expiresAt.isAfter(Instant.now()));
            if (existing.isPresent()) return existing.get();
        }
        return sessions.save(new VisitorSession(UUID.randomUUID().toString(),
            Instant.now().truncatedTo(ChronoUnit.SECONDS).plus(sessionDays, ChronoUnit.DAYS)));
    }

    /** Load match snapshots with their current ordered image metadata, still excluding blob bytes. */
    public List<ProfileResponse> matches(String token) {
        VisitorSession session = requireSession(token, false);
        return swipes.findBySessionIdOrderByCreatedAtAscIdAsc(session.id).stream()
            .filter(s -> s.action != Swipe.Action.pass)
            .map(s -> response(s.profile, s.action == Swipe.Action.super_like)).toList();
    }

    /** Persist a swipe before the client presents the match or removes the card. */
    @Transactional
    public SwipeResult swipe(String token, String profileId, Swipe.Action action) {
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

    /** Return image bytes plus the signature-derived content type required by the streaming controller. */
    public record ImagePayload(String contentType, byte[] bytes) {}
    public record SwipeResult(String profileId, Swipe.Action action, boolean matched, boolean isSuper) {}
}
