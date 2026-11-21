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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class PortfolioService {
    private static final int MAX_IMAGES = 8;
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private final ProfileRepository profiles;
    private final SessionRepository sessions;
    private final SwipeRepository swipes;
    private final ProfileImageRepository images;
    private final ProfileImageBlobRepository imageBlobs;
    private final MessageRepository messages;
    private final CollaborationService collaboration;
    private final AccountService accounts;
    private final ConnectionService connections;
    private final int sessionDays;
    private final Map<String, Deque<Instant>> sendWindows = new ConcurrentHashMap<>();

    public PortfolioService(ProfileRepository profiles, SessionRepository sessions, SwipeRepository swipes,
                            ProfileImageRepository images, ProfileImageBlobRepository imageBlobs,
                            MessageRepository messages, CollaborationService collaboration, AccountService accounts,
                            ConnectionService connections, @Value("${pitchr.session-days}") int sessionDays) {
        this.profiles = profiles;
        this.sessions = sessions;
        this.swipes = swipes;
        this.images = images;
        this.imageBlobs = imageBlobs;
        this.messages = messages;
        this.collaboration = collaboration;
        this.accounts = accounts;
        this.connections = connections;
        this.sessionDays = sessionDays;
    }

    public List<ProfileResponse> profiles() {
        List<Profile> roster = profiles.findAllByOrderByDisplayOrderAsc();
        if (roster.isEmpty()) return List.of();
        // Fetch gallery metadata once; the three ordered detail collections are batch loaded.
        // Uploaded bytes remain in the separate blob repository and are never read here.
        Map<String, List<ProfileImage>> galleries = galleries(roster.stream().map(p -> p.id).toList());
        return roster.stream().map(profile -> ProfileResponse.from(profile, null,
            galleries.getOrDefault(profile.id, List.of()))).toList();
    }

    public ProfileResponse profile(String id) { return response(requireProfile(id), null); }

    @Transactional
    public ProfileResponse createProfile(ProfileRequest request) {
        Profile profile = new Profile();
        profile.id = uniqueSlug(request.name());
        profile.displayOrder = profiles.findAllByOrderByDisplayOrderAsc().stream()
            .mapToInt(existing -> existing.displayOrder).max().orElse(-1) + 1;
        applyEditableFields(profile, request);
        return response(profiles.saveAndFlush(profile), null);
    }

    @Transactional
    public ProfileResponse createOwnProfile(String token, ProfileRequest request) {
        Account owner = accounts.lockForProfileCreation(token);
        ProfileResponse profile = createProfile(request);
        owner.profileId = profile.id();
        return profile;
    }

    public ProfileResponse ownProfile(String token) {
        Account owner = accounts.requireAccount(token);
        if (owner.profileId == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Create your profile to get started.");
        return profile(owner.profileId);
    }

    @Transactional
    public ProfileResponse updateProfile(String id, ProfileRequest request) {
        Profile profile = requireProfile(id);
        applyEditableFields(profile, request);
        return response(profiles.saveAndFlush(profile), null);
    }

    @Transactional
    public void deleteProfile(String id) {
        Profile profile = requireProfile(id);
        messages.deleteAllByProfileId(id);
        messages.flush();
        swipes.deleteAllByProfileId(id);
        profiles.delete(profile);
    }

    @Transactional
    public List<ProfileResponse.Image> addImageFiles(String profileId, List<MultipartFile> files) {
        requireProfileForUpdate(profileId);
        if (files == null || files.isEmpty()) throw badRequest("Select at least one image file");
        long existing = images.countByProfileId(profileId);
        if (existing + files.size() > MAX_IMAGES) throw badRequest("A profile can have at most " + MAX_IMAGES + " images");
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

    @Transactional
    public List<ProfileResponse.Image> addImageUrl(String profileId, String url) {
        requireProfileForUpdate(profileId);
        validateHttpUrl(url, "image URL");
        if (images.countByProfileId(profileId) >= MAX_IMAGES) throw badRequest("A profile can have at most " + MAX_IMAGES + " images");
        int order = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId).size();
        ProfileImage image = images.saveAndFlush(new ProfileImage(profileId, order, url, null, null));
        refreshCover(profileId);
        return List.of(new ProfileResponse.Image(image.id, url));
    }

    @Transactional
    public void deleteImage(String profileId, Long imageId) {
        requireProfileForUpdate(profileId);
        ProfileImage image = images.findById(imageId).filter(row -> row.profileId.equals(profileId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        images.delete(image);
        normalizeImageOrder(profileId);
        refreshCover(profileId);
    }

    @Transactional
    public void reorderImages(String profileId, List<Long> imageIds) {
        requireProfileForUpdate(profileId);
        List<ProfileImage> current = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId);
        if (imageIds == null || imageIds.size() != current.size()
            || new HashSet<>(imageIds).size() != current.size()) throw badRequest("imageIds must contain every current image id exactly once");
        Set<Long> currentIds = current.stream().map(row -> row.id).collect(Collectors.toSet());
        if (!currentIds.equals(new HashSet<>(imageIds))) throw badRequest("imageIds must contain only images belonging to this profile");
        for (int index = 0; index < imageIds.size(); index++) {
            final int order = index;
            Long imageId = imageIds.get(index);
            current.stream().filter(row -> row.id.equals(imageId)).findFirst().orElseThrow().displayOrder = order;
        }
        images.saveAll(current);
        refreshCover(profileId);
    }

    public ImagePayload image(Long id) {
        ProfileImage metadata = images.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        ProfileImageBlob blob = imageBlobs.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Uploaded image data not found"));
        return new ImagePayload(metadata.contentType, blob.data);
    }

    @Transactional
    public VisitorSession resumeSession(String token) {
        if (token != null) {
            var existing = accounts.resolve(token, false);
            if (existing.isPresent()) return existing.get();
        }
        return sessions.save(new VisitorSession(UUID.randomUUID().toString(),
            Instant.now().truncatedTo(ChronoUnit.SECONDS).plus(sessionDays, ChronoUnit.DAYS)));
    }

    public List<ProfileResponse> matches(String token) {
        return connections.list(token).stream().filter(c -> c.status().equals("accepted"))
            .map(ConnectionService.View::profile).toList();
    }

    @Transactional
    public SwipeResult swipe(String token, String profileId, String rawAction) {
        final Swipe.Action action;
        try {
            action = rawAction == null ? null : Swipe.Action.valueOf(rawAction);
        } catch (IllegalArgumentException ex) {
            throw badRequest("action must be pass, like, or super_like");
        }
        if (action == null) throw badRequest("action must be pass, like, or super_like");
        accounts.requireAccount(token);
        VisitorSession session = requireSession(token, false);
        Profile profile = action == Swipe.Action.pass ? requireProfileForUpdate(profileId) : requireProfile(profileId);
        if (action != Swipe.Action.pass && accounts.ownsWorkspaceProfile(session.id, profileId))
            throw badRequest("You cannot match with your own profile.");
        ConnectionService.View relationship = action == Swipe.Action.pass ? null
            : connections.request(token,profileId,action == Swipe.Action.super_like);
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
        return new SwipeResult(profileId, action, relationship != null && relationship.status().equals("accepted"),
            action == Swipe.Action.super_like,relationship == null ? "passed" : relationship.status(),
            relationship == null ? null : relationship.direction());
    }

    public List<ConversationResponse> conversations(String token) {
        return connections.list(token).stream().filter(c -> c.status().equals("accepted"))
            .map(c -> {
                var access=connections.thread(token,c.profile().id());
                List<Message> thread=messages.findBySessionIdAndProfileIdOrderByIdAsc(access.sessionId(),access.profileId());
                Message last=thread.isEmpty() ? null : thread.get(thread.size()-1);
                long unread=thread.stream().filter(m -> m.sender != access.side() && m.readAt == null).count();
                return new ConversationResponse(c.profile(),last == null ? null : MessageResponse.from(last,access.side()),unread);
            }).toList();
    }

    public List<MessageResponse> conversationMessages(String token, String profileId, long afterId) {
        var access=connections.thread(token,profileId);
        List<Message> thread = afterId <= 0
            ? messages.findBySessionIdAndProfileIdOrderByIdAsc(access.sessionId(),access.profileId())
            : messages.findBySessionIdAndProfileIdAndIdGreaterThanOrderByIdAsc(access.sessionId(),access.profileId(),afterId);
        return thread.stream().map(m -> MessageResponse.from(m,access.side())).toList();
    }

    @Transactional
    public MessageResponse sendVisitorMessage(String token, String profileId, String body) {
        VisitorSession session = requireSession(token, false);
        var access=connections.threadForWrite(token,profileId);
        String clean = body == null ? "" : body.trim();
        if (clean.isEmpty() || clean.length() > 1000) throw badRequest("body must be 1-1000 characters");
        if (!checkRateLimit(session.id)) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Message limit reached");
        Message message = new Message();
        message.session = sessions.findById(access.sessionId()).orElseThrow();
        message.profile = requireProfile(access.profileId());
        message.sender = access.side();
        message.body = clean;
        message.createdAt = Instant.now();
        String own=accounts.requireAccount(token).profileId;
        connections.notifyProfile(profileId,own,"message",clean);
        return MessageResponse.from(messages.save(message),access.side());
    }

    public List<MessageResponse> locations(String token, String profileId) {
        var access = connections.thread(token, profileId);
        return messages.findBySessionIdAndProfileIdAndLocationExpiresAtIsNotNullOrderByIdAsc(access.sessionId(), access.profileId())
            .stream().map(m -> MessageResponse.from(m, access.side())).toList();
    }

    @Transactional
    public MessageResponse shareLocation(String token, String profileId, double latitude, double longitude, String name, int minutes) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
            || (minutes != 15 && minutes != 60) || name == null || name.isBlank() || name.length() > 100)
            throw badRequest("Choose a valid location and a duration of 15 or 60 minutes.");
        var access = connections.threadForWrite(token, profileId);
        // Use the existing consent, notification and message rate-limit path. Coordinates never enter the body or notifications.
        MessageResponse sent = sendVisitorMessage(token, profileId, "Shared an approximate location");
        Message message = messages.findById(sent.id()).orElseThrow();
        // A replacement ends this sender's previous active shares in the same conversation.
        for (Message previous : messages.findBySessionIdAndProfileIdAndLocationExpiresAtIsNotNullOrderByIdAsc(access.sessionId(), access.profileId())) {
            if (previous.sender == access.side() && previous.locationStoppedAt == null && previous.locationExpiresAt.isAfter(Instant.now()))
                eraseLocation(previous);
        }
        message.locationLat = Math.round(latitude * 1000d) / 1000d;
        message.locationLon = Math.round(longitude * 1000d) / 1000d;
        message.locationName = name.trim();
        message.locationExpiresAt = Instant.now().plusSeconds(minutes * 60L);
        return MessageResponse.from(message, access.side());
    }

    @Transactional
    public MessageResponse stopLocation(String token, String profileId, long id) {
        var access = connections.threadForWrite(token, profileId);
        Message message = messages.findByIdAndSessionIdAndProfileIdAndLocationExpiresAtIsNotNull(id, access.sessionId(), access.profileId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location share not found."));
        if (message.sender != access.side()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only stop your own location share.");
        eraseLocation(message);
        return MessageResponse.from(message, access.side());
    }

    private void eraseLocation(Message message) {
        if (message.locationStoppedAt == null) message.locationStoppedAt = Instant.now();
        message.locationLat = null; message.locationLon = null; message.locationName = null;
    }

    @Transactional
    public void markConversationRead(String token, String profileId) {
        requireSession(token, false);
        var access=connections.threadForWrite(token,profileId);
        Instant now = Instant.now();
        Message.Sender incoming=access.side() == Message.Sender.member ? Message.Sender.visitor : Message.Sender.member;
        for (Message message : messages.findBySessionIdAndProfileIdAndSenderAndReadAtIsNull(access.sessionId(),access.profileId(),incoming)) {
            message.readAt = now;
        }
        connections.readMessageNotices(accounts.requireAccount(token).profileId,profileId);
    }

    @Transactional
    public MessageResponse sendTeamMessage(String sessionId, String profileId, String body) {
        VisitorSession session = sessions.findById(sessionId).filter(s -> s.expiresAt.isAfter(Instant.now())).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Visitor session not found"));
        requireMatched(session, profileId);
        String clean = body == null ? "" : body.trim();
        if (clean.isEmpty() || clean.length() > 1000) throw badRequest("body must be 1-1000 characters");
        Message message = new Message();
        message.session = session;
        message.profile = requireProfile(profileId);
        message.sender = Message.Sender.member;
        message.body = clean;
        message.createdAt = Instant.now();
        collaboration.notify(sessionId, profileId, "message", clean);
        return MessageResponse.from(messages.save(message));
    }

    public List<TeamConversationResponse> teamConversations(String profileId) {
        return connections.acceptedThreads().stream()
            .filter(c -> profileId == null || profileId.isBlank() || c.threadProfileId.equals(profileId))
            .map(c -> {
                List<Message> thread = messages.findBySessionIdAndProfileIdOrderByIdAsc(c.threadSessionId,c.threadProfileId);
                Message last = thread.isEmpty() ? null : thread.get(thread.size() - 1);
                return new TeamConversationResponse(c.threadSessionId, response(requireProfile(c.threadProfileId),c.priority),
                    last == null ? null : MessageResponse.from(last));
            }).toList();
    }

    public List<MessageResponse> teamConversationMessages(String sessionId, String profileId) {
        connections.acceptedThread(sessionId,profileId);
        requireProfile(profileId);
        sessions.findById(sessionId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Visitor session not found"));
        return messages.findBySessionIdAndProfileIdOrderByIdAsc(sessionId, profileId).stream().map(MessageResponse::from).toList();
    }

    private void requireMatched(VisitorSession session, String profileId) {
        if (accounts.ownsWorkspaceProfile(session.id, profileId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot message your own profile.");
        connections.acceptedThread(session.id,profileId);
    }

    private boolean checkRateLimit(String sessionId) {
        Deque<Instant> window = sendWindows.computeIfAbsent(sessionId, key -> new ArrayDeque<>());
        synchronized (window) {
            Instant cutoff = Instant.now().minusSeconds(60);
            while (!window.isEmpty() && window.peekFirst().isBefore(cutoff)) window.removeFirst();
            if (window.size() >= 20) return false;
            window.addLast(Instant.now());
            return true;
        }
    }

    private void refreshCover(String profileId) {
        Profile profile = requireProfile(profileId);
        List<ProfileImage> ordered = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId);
        profile.image = ordered.isEmpty() ? null : ordered.get(0).sourceUrl != null ? ordered.get(0).sourceUrl
            : "/api/images/" + ordered.get(0).id;
        profiles.save(profile);
    }

    private void normalizeImageOrder(String profileId) {
        List<ProfileImage> ordered = images.findByProfileIdOrderByDisplayOrderAscIdAsc(profileId);
        for (int index = 0; index < ordered.size(); index++) ordered.get(index).displayOrder = index;
        images.saveAll(ordered);
    }

    private Map<String, List<ProfileImage>> galleries(List<String> ids) {
        if (ids.isEmpty()) return Map.of();
        return images.findByProfileIdInOrderByProfileIdAscDisplayOrderAscIdAsc(ids).stream()
            .collect(Collectors.groupingBy(image -> image.profileId));
    }

    private ProfileResponse response(Profile profile, Boolean isSuper) {
        return ProfileResponse.from(profile, isSuper, images.findByProfileIdOrderByDisplayOrderAscIdAsc(profile.id));
    }

    private void applyEditableFields(Profile profile, ProfileRequest request) {
        if (request.details() != null) {
            if (request.details().github() != null && !request.details().github().isBlank())
                validateHttpUrl(request.details().github(), "GitHub URL");
            if (request.details().linkedin() != null && !request.details().linkedin().isBlank())
                validateHttpUrl(request.details().linkedin(), "LinkedIn URL");
        }
        profile.name = request.name().trim();
        profile.persona = request.persona();
        profile.age = request.age();
        profile.location = request.location();
        profile.role = request.role();
        profile.verified = Boolean.TRUE.equals(request.verified());
        profile.matchPercentage = request.matchPercentage() == null || request.matchPercentage().isBlank()
            ? "New" : request.matchPercentage();
        profile.bio = request.bio();
        profile.tags.clear();
        if (request.tags() != null) profile.tags.addAll(request.tags());
        profile.dealbreakers.clear();
        if (request.dealbreakers() != null) profile.dealbreakers.addAll(request.dealbreakers());
        ProfileRequest.DetailsRequest details = request.details();
        profile.fullBio = details == null ? null : details.fullBio();
        profile.github = details == null ? null : details.github();
        profile.linkedin = details == null ? null : details.linkedin();
        profile.email = details == null ? null : details.email();
        profile.projects.clear();
        if (details != null && details.projects() != null) {
            for (ProfileRequest.ProjectRequest project : details.projects()) {
                Profile.Project entity = new Profile.Project();
                entity.title = project.title();
                entity.description = project.desc();
                profile.projects.add(entity);
            }
        }
    }

    private String uniqueSlug(String name) {
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        String base = normalized.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isBlank()) base = "profile";
        String candidate = base;
        int suffix = 2;
        while (profiles.existsById(candidate)) candidate = base + "-" + suffix++;
        return candidate;
    }

    private String detectImageType(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff) return "image/jpeg";
        if (bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N'
            && bytes[3] == 'G' && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) return "image/png";
        if (bytes.length >= 6 && (new String(bytes, 0, 6, java.nio.charset.StandardCharsets.US_ASCII).equals("GIF87a")
            || new String(bytes, 0, 6, java.nio.charset.StandardCharsets.US_ASCII).equals("GIF89a"))) return "image/gif";
        if (bytes.length >= 12 && new String(bytes, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
            && new String(bytes, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        throw badRequest("Only valid JPEG, PNG, WebP, and GIF images are allowed");
    }

    private void validateHttpUrl(String value, String field) {
        try {
            URI uri = URI.create(value);
            if (!( "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null) throw new IllegalArgumentException();
        } catch (RuntimeException ex) {
            throw badRequest(field + " must be a valid http(s) URL");
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private Profile requireProfile(String id) {
        return profiles.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found"));
    }

    private Profile requireProfileForUpdate(String id) {
        return profiles.findForUpdate(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found"));
    }

    private VisitorSession requireSession(String token, boolean lock) {
        if (token == null || token.isBlank()) throw unauthorized();
        return accounts.resolve(token, lock).orElseThrow(this::unauthorized);
    }

    private ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Create or resume a visitor session first");
    }

    public record ConversationResponse(ProfileResponse profile, MessageResponse lastMessage, long unreadCount) {}
    public record TeamConversationResponse(String sessionId, ProfileResponse profile, MessageResponse lastMessage) {}
    public record ImagePayload(String contentType, byte[] bytes) {}
    public record SwipeResult(String profileId, Swipe.Action action, boolean matched, boolean isSuper, String status, String direction) {}
}
