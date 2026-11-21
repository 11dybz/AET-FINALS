# Rizzume backend

Spring Boot 4.1.2, Java 17, Spring MVC, Spring Data JPA, Bean Validation, and Flyway. It serves the vanilla-JS/Tailwind frontend from the sibling `FRONTEND/` folder. Local development uses file-backed H2; the `supabase` profile uses Supabase PostgreSQL in the dedicated `pitchr` schema. Hibernate runs with `ddl-auto=validate`, so schema changes must be introduced as new Flyway migrations. Do not edit V1 or V2.

## Run locally (Windows)

```powershell
cd BACKEND
.\mvnw.cmd spring-boot:run
```

Open `http://localhost:8080/`. The app creates `BACKEND/data/pitchr.mv.db` when launched from `BACKEND`; use the same working directory to reuse the database.

### Login and registration

Open `/login.html` or `/register.html` (aliases `/login` and `/register` also work). The discovery workspace now checks the signed-in account before loading; individual public portfolio pages remain readable. Registration asks for full name, email, password, and password confirmation. Successful registration signs in immediately. There are no password recovery controls or endpoints, social sign-in, or email-verification flows in this version.

Accounts use Spring Boot authentication stored in the existing application database. With the Supabase profile, V6 creates **pitchr.accounts** and **pitchr.account_sessions** automatically at startup. These accounts are separate from Supabase Auth's `auth.users`; no Supabase JavaScript API key or Auth dashboard configuration is required. The four seeded portfolio profiles are not pre-created login accounts: register an account using the new page.

Passwords must contain 10–128 characters and are stored as salted PBKDF2-HMAC-SHA256 hashes with 600,000 iterations. Login cookies contain fresh random tokens; the database stores only their SHA-256 digests. Cookies are HttpOnly and SameSite=Lax, expire after seven days, and become Secure when `COOKIE_SECURE=true` (set this for HTTPS hosting). Logout revokes the current credential, clears its cookie, and ends active account calls. Matches, conversations, and notifications use a private, persistent workspace, so signing in again restores them. A workspace ID is not accepted as a login credential. Existing guest data is not automatically moved into new accounts. Legacy visitor APIs remain available for public portfolio clients, with account workspaces excluded from anonymous access.

Authentication endpoints are `/api/auth/register` (POST JSON), `/api/auth/login` (POST JSON), `/api/auth/me` (GET), and `/api/auth/logout` (POST). Credentials never go into browser storage. Redirects are limited to known pages on the same origin, form submissions reject untrusted browser origins, and registration/login attempts are limited to 20 per client address per ten minutes in each running backend instance. Existing admin and team keys remain separate permissions; registration never grants team-inbox or admin access.

After updating the code, stop the running backend and restart with the same profile:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=supabase"
```

Authentication and portfolio checks against isolated H2 databases, without opening server ports:

```powershell
.\mvnw.cmd "-Dtest=AccountWorkflowTests,PortfolioWorkflowTests" test
```

### Discovery, video calls, maps, and notifications

The frontend opens into a Tinder-inspired discovery deck, with desktop navigation and a mobile bottom bar. Preferences filter the deck by name, skill, role, or city. The directory and profile editor remain available under **Explore the team**.

Account-to-account calls work after connection acceptance. To enable the optional protected administrative team inbox, set a private team key in the same PowerShell terminal before starting Spring Boot:

```powershell
$env:TEAM_INBOX_KEY = "replace-with-your-private-team-key"
.\mvnw.cmd spring-boot:run
```

A signed-in user creates a profile and sends a connection request. The recipient accepts it under **Connections → Incoming**. Both people can then open **Messages**, select each other, and start or answer a video call in their normal account workspace. Pending requests cannot message or call. The team inbox remains an optional trusted administrative interface and requires its key; ordinary users never need that key.

Both participants must keep the page open. Camera and microphone access occurs only after starting or answering. Closing, ending, declining, removing the connection, or failed calls releases the devices. Calls time out after 90 seconds without an answer, after 60 seconds without either participant's heartbeat, or at one hour. Both account ownership and the accepted connection are checked on every signaling request. Invitations are limited to five per caller per minute, and busy participants cannot start overlapping calls.

Camera, microphone, browser alerts, and device location require browser support and permissions. For remote devices serve the app over HTTPS. STUN is configured by default; for reliable calling across restrictive networks set `TURN_URL` (for example `turn:your-relay.example:3478`), `TURN_USERNAME`, and `TURN_PASSWORD` to your own relay's settings. ICE configuration is sent to authorized call participants; use scoped, short-lived relay credentials for public hosting. No recording feature is implemented. Browser lifecycle tests mock media; actual two-device media and relay connectivity must also be checked on the intended deployment.

**Location** embeds OpenStreetMap. Supported profile cities use city-center pins; they do not represent live positions. **Use my location** requests a one-time approximate device position and keeps it in page memory. It is supplied to OpenStreetMap to render the map, and is sent to a conversation only by clicking **Share in this chat**. **Clear my location** clears the local position. Unsupported cities have an external map-search link. Map viewing needs internet access.

Notifications for connection requests, accepted connections, messages and call updates are persisted per account workspace. Responding to a request clears the pending request notice; reading a conversation clears its message notices. **Mark all read** only marks items through the most recent displayed ID, preserving replies that arrive during the request. The latest 100 items are shown. Optional browser alerts poll while the page is open; they are not background push notifications and do not operate after the page is closed.

V5 adds the call, ICE signaling, and notification tables to H2 and PostgreSQL. Profile/session deletion cascades to these new rows. Restart the backend after pulling changes so Flyway applies V5 and loads the new controllers; refreshing the browser alone cannot load new Java classes.

Targeted checks that do not bind a network port:

```powershell
node --test ../FRONTEND/tests/*.test.cjs
.\mvnw.cmd "-Dtest=PortfolioWorkflowTests" test
```

```powershell
.\mvnw.cmd test
.\mvnw.cmd package
```

The Maven test suite runs the shared HTTP contract against H2 and a temporary embedded PostgreSQL instance, plus a separate admin-key test context. No production Supabase credentials are used in tests.

## API endpoints

All paths below are prefixed with `/api`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/profiles` | Return all profiles in display order, including ordered image metadata (no binary payloads) |
| GET | `/profiles/{id}` | Return one full profile or 404 |
| POST | `/profiles` | Create a profile; server generates a unique lowercase-hyphen slug and appends its display order; returns 201 |
| PUT | `/profiles/{id}` | Replace all editable profile fields; slug is immutable; returns 200 |
| DELETE | `/profiles/{id}` | Delete profile, related swipes, gallery rows/blobs, tags, highlights, and projects; returns 204 |
| POST | `/profiles/{id}/images` | Add multipart `files` (one or more uploads) or JSON `{ "url": "https://..." }`; returns 201 |
| DELETE | `/profiles/{id}/images/{imageId}` | Delete one image owned by that profile; returns 204 |
| PUT | `/profiles/{id}/images/order` | Reorder the entire gallery using `{ "imageIds": [12, 13] }`; list must exactly match the current image IDs; returns 204 |
| GET | `/images/{imageId}` | Stream an uploaded image with its verified content type and immutable cache headers |
| POST | `/session` | Create/resume an anonymous visitor session and set an HttpOnly cookie |
| PUT | `/me/swipes/{profileId}` | Save `{ "action": "pass" }`, `like`, or `super_like` |
| GET | `/me/matches` | Return accepted connections only for the visitor cookie; `isSuper` appears only here |
| GET | `/team` | Return the team name and contact email |

Profile JSON preserves the established `tags`, `dealbreakers`, and `details` object shape. Project descriptions are exposed as `details.projects[].desc`. A profile also has `images: [{ "id": 12, "url": "/api/images/12" }]`; URL-backed gallery entries return their external URL. The legacy `image` property remains the cover-image field and always matches the first ordered gallery URL, or `null` if there are no images.

### Profile and image validation

Profile request validation enforces: name 1–100 characters and required; persona, role, and location up to 255; age 16–120; bio up to 2,000; full bio up to 4,000; up to 15 tags of 50 characters; up to 10 highlights of 300 characters; up to 10 projects with title up to 255 and description up to 2,000; match percentage up to 255 (defaults to `New`). GitHub, LinkedIn, and image URLs must use HTTP(S); email must be a valid email address.

Each profile supports at most 8 images total: one profile picture shown on the card and up to seven additional photos visible when opening the card. The first ordered image is the profile picture; owners can change it with Set as profile picture in the editor. Each upload is limited to 5 MB and accepted only when its magic bytes identify JPEG, PNG, WebP, or GIF. SVG is not accepted. The server does not trust the browser's Content-Type header. Uploaded bytes are stored in `profile_image_blobs`; `profile_images` contains only metadata, so profile list responses do not load blobs. The two-table layout uses a binary/VARBINARY mapping compatible with PostgreSQL `BYTEA` and H2 binary-varying storage. Multipart limits are 5 MB per part and 42 MB per request.

The V4 migration backfills an image-gallery row for each seeded profile and changes the seed cover paths to the local files already served by the frontend: `/images/chee.jpg`, `/images/greg.jpg`, `/images/dave.jpg`, and `/images/justin.jpg`.

### Profile ownership and write protection

Accounts cannot like, super-like, message, or call their own linked profile. The backend checks ownership independently of the frontend. The discovery deck and match/conversation lists exclude the owned profile; the directory and My profile still show it for viewing/editing. V8 removes existing self-matches by setting those swipes to pass, ends active self-calls, and marks their match notifications read. It preserves accounts, profiles, other connections, and existing message history. Restart the backend to apply V8; refreshing the browser alone does not load server-side changes.

Each account can own one profile, and a profile can have only one account owner. V7 adds the unique `accounts.profile_id` foreign key and links the existing account `reychee06@gmail.com` to the seeded `chee-reynaldo` profile, comparing the email without case sensitivity. This assignment applies to an account that exists when V7 runs. Public registration cannot claim a seeded profile merely by supplying its name, email, or ID. If the requested account is created later, a trusted operator must assign it in the database after checking the account.

Signed-in users can create one profile and can update or delete only their own profile. The same ownership check covers file uploads, image URLs, gallery ordering, and image deletion. These checks run in the backend for every write. A signed-in user cannot use an admin header to edit another profile. Anonymous and legacy visitor cookies cannot write profiles when `ADMIN_KEY` is blank. Trusted server-side maintenance without an account cookie may use a configured `X-Admin-Key`, compared in constant time; the browser editor never asks for this key or sends an override.

`GET /api/me/profile` returns the current account's profile, or 404 if it has not created one. `/api/auth/me` includes `user.profileId`. **My profile** is available in the sidebar and the account menu. Directory and full-profile views show management controls only on the owned profile. Accounts without a profile can select **Create my profile**. After deleting an owned profile, the foreign key clears the account link so that another can be created. Profile contact-email edits never change ownership.

For the default local H2 profile, export `ADMIN_KEY` in the process environment (or set `pitchr.admin-key` in `application.properties`); the default profile does not import `.env`. The Supabase profile imports `BACKEND/.env`, which is parsed as Java properties: do not add `export` or surrounding quotes.

## Supabase PostgreSQL

1. In Supabase, open **Connect → Session pooler** and copy the host, database name, username, and password.
2. Copy `.env.example` to `.env`, then fill in the real values:

```properties
SUPABASE_DB_URL=jdbc:postgresql://YOUR_SESSION_POOLER_HOST:5432/postgres?sslmode=require
SUPABASE_DB_USERNAME=postgres.YOUR_PROJECT_REF
SUPABASE_DB_PASSWORD=your-database-password
ADMIN_KEY=replace-with-a-long-random-secret
```

3. Start the application with the Supabase profile:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=supabase" "-Dspring-boot.run.arguments=--server.port=8081"
```

For the packaged application:

```powershell
java -jar target/pitchr-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=supabase --server.port=8081
```

The Supabase profile requires the three connection properties and never falls back to H2. It enables encrypted PostgreSQL connections (`sslmode=require`) and uses a five-connection application pool. For certificate verification, use `sslmode=verify-full` and the database CA certificate as described in [Supabase's connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

On the first successful connection, Flyway creates the **pitchr** schema and its tables and seeds the four members. Hibernate validates the schema; it does not automatically rewrite tables. Use a database role that can create and own this schema. Existing objects in `public`, `auth`, and `storage` are not used by this application. Keep `pitchr` out of the Supabase Data API's exposed schemas; the frontend should use Spring Boot's `/api` endpoints, which enforce visitor ownership. Supabase Auth is not part of this database connection. Public preview remains available, while requests, connections, messages and calls require an application account.

Check the connection after startup:

```powershell
Invoke-RestMethod 'http://localhost:8081/api/profiles'
```

The Supabase project stores new profiles, sessions, and swipes independently of the local H2 database. Existing H2 visitor sessions/swipes are not transferred automatically. If Supabase is unreachable, check the exact pooler host/username, database password, network restrictions, and whether the project is paused.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/profiles` | All four full profiles in display order; JSON array |
| GET | `/api/profiles/{id}` | One full profile, or 404 |
| POST | `/api/session` | Create/resume anonymous visitor; sets HttpOnly cookie; returns `expiresAt` |
| PUT | `/api/me/swipes/{profileId}` | Save/update `{ "action": "pass" }`, `like`, or `super_like` |
| GET | `/api/me/matches` | Accepted counterpart profiles with `isSuper` |
| GET | `/api/team` | Team `name` and `email` |

Profile JSON retains the frontend's `tags`, `dealbreakers`, and `details` structure, including project `title` and `desc`. Profiles do not contain an `isSuper` property until returned as matches.

Swipe response:

```json
{"profileId":"chee-reynaldo","action":"super_like","matched":false,"isSuper":true,"status":"pending","direction":"outgoing"}
```

A like or super like now creates a pending connection request. Only the recipient can accept or decline, only the sender can cancel, and either accepted participant can remove the connection. Crossed requests remain pending until explicitly accepted. `pass` records a discovery skip and does not remove an accepted connection. `GET /api/me/matches` is a compatibility endpoint for accepted connections only.

`GET /api/me/connections` returns relationship views with the other profile, `status`, `direction`, `priority`, timestamps, and `ownerAvailable`. `POST /api/me/connection-requests/{profileId}` accepts `{ "priority": false }`. `POST /api/me/connections/{profileId}/action` accepts `{ "action": "accept" }`, `decline`, `cancel` or `remove`. Requests require an account with its own profile; self-requests and unauthorized actions are rejected. Closed requests have a one-minute resend cooldown.

Messaging is a shared thread for the pair. Responses expose `visitor` as the current user's own messages and `member` as the counterpart's messages, regardless of who originally sent the request. Removal closes message/call access for both people and preserves history for a future accepted request. Missing or expired authentication returns 401. Account sessions last seven days; logging out invalidates the credential and ends incoming and outgoing calls while preserving requests, connections and messages.

V9 migrates saved likes from accounts with owned profiles into pending requests and merges reverse legacy message threads while preserving authors, timestamps, ids and read receipts. It does not infer mutual consent. Unlinked seeded cards wait for a verified owner account before requests can be accepted.

Bad/missing actions return 400; unknown profiles return 404. Errors include `timestamp`, `status`, `message`, and `path`. API responses use `Cache-Control: no-store`.

## Try it in PowerShell

```powershell
$base = 'http://localhost:8080/api'
Invoke-RestMethod "$base/profiles"
# Register a test account, then create its own profile.
$registration = @{name='Test Developer';email='your-test-email@example.com';password='Choose-your-test-password';confirmPassword='Choose-your-test-password'} | ConvertTo-Json
Invoke-RestMethod "$base/auth/register" -Method Post -SessionVariable visitor -ContentType 'application/json' -Body $registration
Invoke-RestMethod "$base/profiles" -Method Post -WebSession $visitor -ContentType 'application/json' -Body '{"name":"Test Developer","age":22}'
Invoke-RestMethod "$base/me/connection-requests/chee-reynaldo" -Method Post -WebSession $visitor -ContentType 'application/json' -Body '{"priority":false}'
Invoke-RestMethod "$base/me/connections" -WebSession $visitor
# The recipient must log in and accept under Incoming before messaging is available.
```

## Frontend connection

Spring Boot serves the homepage at `/`, all four member portfolio pages, and the frontend assets. The frontend uses `/api` on the same origin, so it follows the backend's current port automatically. Session initialization uses the shared request helper and shows a message if the backend is unavailable.

The profile overlay displays every card, including newly created profiles. Gallery images use horizontal scroll snapping, dots/counter, arrow buttons, and a fullscreen lightbox with keyboard/touch navigation. The four member pages load current profile data from the backend and persist likes through the visitor session. Their links are shown from the overlay.

The frontend uses `credentials: 'include'` for API calls. A separately hosted frontend can set `window.RIZZUME_API_BASE = 'http://localhost:8081/api'` before loading `script.js`. The default CORS allowlist is `http://localhost:5500` and `http://127.0.0.1:5500`; set `ALLOWED_ORIGINS` to your deployed frontend origin(s).

Run frontend regression tests from the repository root:

```sh
node --test FRONTEND/tests/app.test.cjs
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP server port |
| `DB_URL` | `jdbc:h2:file:./data/pitchr;WRITE_DELAY=0` | Local H2 URL |
| `DB_USERNAME` | `sa` | Local H2 username |
| `DB_PASSWORD` | empty | Local H2 password |
| `TEAM_EMAIL` | `team.leads@example.com` | Team contact email |
| `ALLOWED_ORIGINS` | localhost ports 5500 | Comma-separated allowed frontend origins |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |

For Supabase, enable the `supabase` profile and use `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, and `SUPABASE_DB_PASSWORD` instead of the local `DB_*` settings. The PostgreSQL JDBC driver and Flyway PostgreSQL module are bundled. Keep the API and frontend on the same site when deploying, configure HTTPS, and set COOKIE_SECURE=true. Signed-in accounts can edit only their own linked profile and gallery; the configured admin key is reserved for explicit maintenance without an account session. The team inbox uses TEAM_INBOX_KEY; server-side email delivery is not implemented.

## Source layout

- `Profile`, `VisitorSession`, `Swipe`: database entities.
- `*Repository`: database access.
- `PortfolioService`: transactions, session ownership, and swipe rules.
- `PortfolioController`: HTTP endpoints and session cookie.
- `ProfileResponse`: frontend-compatible response structure.
- `WebConfig`, `ApiExceptionHandler`: allowed frontend origins and API errors.
- `src/main/resources/db/migration`: versioned schema and seed data. Add a new migration to change an initialized database; do not edit an already-applied migration.
- `PortfolioApiTests`: HTTP integration tests covering profile shape, visitor isolation, retry/concurrency handling, upgrades, passes, invalid input, expiry, and allowed origins.
- `PostgresApiTests`: runs the same HTTP suite against a real temporary PostgreSQL server and checks schema isolation. Uses [embedded-postgres](https://github.com/zonkyio/embedded-postgres) test binaries; no Docker or Supabase credentials are required. Tests do not read `.env` or access your remote database.
- `application-supabase.properties`, `.env.example`: Supabase connection profile and local configuration template.

## Rizzume maintenance and checks

The website, API metadata and Spring application display name use **Rizzume**. Existing Java package names, database paths/schema, configuration properties, Maven artifact name and visitor cookie remain compatible with existing installations. No database migration or reset is needed for the rename. The legacy window.PITCHR_API_BASE setting remains supported, while new setups should use window.RIZZUME_API_BASE on all pages.

Profile management is implemented in FRONTEND/editor.js. Signed-in users choose **My profile** to edit their own card, biography, skills, highlights, projects, photos and public contact links. The server enforces ownership on all profile and gallery mutations. A new account creates one profile before adding photos. The first photo is the card cover; photo changes save immediately, while text changes use **Save changes**. The member portfolio pages use FRONTEND/profile.js. The team inbox uses FRONTEND/team-inbox.js and requires TEAM_INBOX_KEY in the backend environment (or the Supabase .env file).

The editor opens from the loaded roster and patches returned profile data locally after saves, preserving the swipe stack. Independent startup reads run concurrently after authentication. Roster and match reads batch gallery metadata and ordered detail collections rather than querying each profile separately. ProfileLoadingTests verifies five queries for a roster of up to 50 profiles (larger rosters need additional collection batches); uploaded image bytes are fetched only when an image URL is requested. Restart the backend after Java changes to activate these query improvements.

FRONTEND/tests/profile-editor.fixture.html is an isolated browser fixture with sample data and a mock API. It is excluded from the packaged application. For visual checks, temporarily copy it to target/classes/static/profile-editor.fixture.html while the local server is running; remove that copy afterward. It supports live previews, project editing, photo ordering, creation, and a failed-save retry without changing application accounts or profiles.

Additional regression checks:

```powershell
node --test FRONTEND/tests/*.test.cjs
cd BACKEND
.\mvnw.cmd "-Dtest=PortfolioWorkflowTests" test
```

PortfolioWorkflowTests exercises controllers, validation, migrations and persistence against isolated in-memory H2 using MockMvc, without a listening HTTP port or production database credentials. It covers profile edits, image uploads, MIME validation, conversation ownership, team replies, read receipts and deletion with existing messages. The existing HTTP and embedded PostgreSQL suites still run with the normal Maven test command in an environment that permits local network connections.

## Profile and messaging workspace

### Resume PDF export

Signed-in users can select **Download PDF** in My profile or **Download resume PDF** in the account menu. The download uses the current saved profile from the ownership-protected `/api/me/profile` endpoint; save edits first to include them. It includes the public name, role, location and contact email, bio, skills, projects, highlights, and valid GitHub/LinkedIn links. Account credentials, private sign-in email, matches, and messages are excluded. A saved profile is required.

The exporter creates an A4 PDF in the browser with selectable text, automatic wrapping and page breaks, clickable web links, and page numbers. Empty sections are omitted. Decorative leading checkmarks on highlights become ordinary list markers. Text outside the standard PDF font's character set uses browser-rendered image runs, which remain visible but are not selectable. The locally bundled MIT-licensed pdf-lib 1.17.1 is loaded only on export; no CDN, external PDF service, additional Maven dependency, or database migration is needed. Maven bundles `FRONTEND/vendor/**` with the frontend. Run `node --test FRONTEND/tests/resume.test.cjs` to check PDF contents, pagination, access checks, downloads, and retry behavior.

The profile editor has separate card, about, projects, photos and links sections, a live card preview, a mobile preview toggle, field limits and unsaved-change protection. Updated assets use a versioned URL to avoid showing an old editor from the browser cache.

FRONTEND/messages.js and messages.css provide the inbox and conversation layout. Desktop keeps both panes visible. Mobile switches between inbox and thread, keeps drafts per connection in memory, and avoids automatically opening the keyboard. Empty, loading, search, unread-filter, failed-load, pending-send and failed-send states keep the same layout. Inbox requests and conversation requests reject stale responses after navigation. Drafts are never stored in browser storage.

For isolated visual checks with the local backend already running, run `node FRONTEND/tests/prepare-preview.cjs` from the repository root. The generated workspace.fixture.html uses mock API responses and cannot write to real accounts or conversations. Choose a documented state in its query string: empty, fresh, filled, error, thread-error, loading or inbox-loading. The fixture files are not included by Maven's frontend resource include patterns; remove the temporary copies from target/classes/static after checking and before packaging.
