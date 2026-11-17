# pitchr. backend

Spring Boot 4.1.2, Java 17, Spring MVC, Spring Data JPA, Bean Validation, and Flyway. It serves the vanilla-JS/Tailwind frontend from the sibling `FRONTEND/` folder. Local development uses file-backed H2; the `supabase` profile uses Supabase PostgreSQL in the dedicated `pitchr` schema. Hibernate runs with `ddl-auto=validate`, so schema changes must be introduced as new Flyway migrations. Do not edit V1 or V2.

## Run locally (Windows)

```powershell
cd BACKEND
.\mvnw.cmd spring-boot:run
```

Open `http://localhost:8080/`. The app creates `BACKEND/data/pitchr.mv.db` when launched from `BACKEND`; use the same working directory to reuse the database.

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
| GET | `/me/matches` | Return liked and super-liked profiles for the visitor cookie; `isSuper` appears only here |
| GET | `/team` | Return the team name and contact email |

Profile JSON preserves the established `tags`, `dealbreakers`, and `details` object shape. Project descriptions are exposed as `details.projects[].desc`. A profile also has `images: [{ "id": 12, "url": "/api/images/12" }]`; URL-backed gallery entries return their external URL. The legacy `image` property remains the cover-image field and always matches the first ordered gallery URL, or `null` if there are no images.

### Profile and image validation

Profile request validation enforces: name 1–100 characters and required; persona, role, and location up to 255; age 16–120; bio up to 2,000; full bio up to 4,000; up to 15 tags of 50 characters; up to 10 highlights of 300 characters; up to 10 projects with title up to 255 and description up to 2,000; match percentage up to 255 (defaults to `New`). GitHub, LinkedIn, and image URLs must use HTTP(S); email must be a valid email address.

Each profile supports at most 8 images. Each upload is limited to 5 MB and accepted only when its magic bytes identify JPEG, PNG, WebP, or GIF. SVG is not accepted. The server does not trust the browser's Content-Type header. Uploaded bytes are stored in `profile_image_blobs`; `profile_images` contains only metadata, so profile list responses do not load blobs. The two-table layout uses a binary/VARBINARY mapping compatible with PostgreSQL `BYTEA` and H2 binary-varying storage. Multipart limits are 5 MB per part and 42 MB per request.

The V3 migration backfills an image-gallery row for each seeded profile and changes the seed cover paths to the local files already served by the frontend: `/images/chee.jpg`, `/images/greg.jpg`, `/images/dave.jpg`, and `/images/justin.jpg`.

### Write protection

Profile and gallery `POST`, `PUT`, and `DELETE` requests are protected when `ADMIN_KEY` is nonblank. Send it in the `X-Admin-Key` header. The comparison uses `MessageDigest.isEqual`; a missing or incorrect key returns 403. Public `GET` routes are unchanged. When `ADMIN_KEY` is blank (the default for local/demo use), write routes remain open and the application logs a startup warning. The frontend prompts for the key after a 403 and keeps it in page memory only; it is not written to browser storage.

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

On the first successful connection, Flyway creates the **pitchr** schema and its tables and seeds the four members. Hibernate validates the schema; it does not automatically rewrite tables. Use a database role that can create and own this schema. Existing objects in `public`, `auth`, and `storage` are not used by this application. Keep `pitchr` out of the Supabase Data API's exposed schemas; the frontend should use Spring Boot's `/api` endpoints, which enforce visitor ownership. Supabase Auth is not part of this database connection; anonymous visitor cookies continue to work as before.

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
| GET | `/api/me/matches` | Full liked/super-liked profiles with `isSuper` |
| GET | `/api/team` | Team `name` and `email` |

Profile JSON retains the frontend's `tags`, `dealbreakers`, and `details` structure, including project `title` and `desc`. Profiles do not contain an `isSuper` property until returned as matches.

Swipe response:

```json
{"profileId":"chee-reynaldo","action":"super_like","matched":true,"isSuper":true}
```

Matches are saved developers, without mutual approval. A session has one decision per profile: retrying a PUT is safe, `super_like` upgrades a like, and `pass` removes an existing match. Reloading the frontend deck should simply reuse the roster; it does not delete matches. The full roster is always returned, even for profiles previously passed or liked.

Sessions expire after 30 days, with a fixed expiry. Expired/unknown cookies are replaced by POST `/api/session`. Protected endpoints return 401 for missing/invalid/expired sessions. Visitors are isolated by their opaque cookie; clearing cookies starts a fresh visitor. Expired rows are retained locally; add scheduled cleanup before long-running public deployment.

Bad/missing actions return 400; unknown profiles return 404. Errors include `timestamp`, `status`, `message`, and `path`. API responses use `Cache-Control: no-store`.

## Try it in PowerShell

```powershell
$base = 'http://localhost:8080/api'
Invoke-RestMethod "$base/profiles"
Invoke-RestMethod "$base/session" -Method Post -SessionVariable visitor
Invoke-RestMethod "$base/me/swipes/chee-reynaldo" -Method Put `
    -WebSession $visitor -ContentType 'application/json' `
    -Body '{"action":"super_like"}'
Invoke-RestMethod "$base/me/matches" -WebSession $visitor
```

## Frontend connection

Spring Boot serves the homepage at `/`, all four member portfolio pages, and the frontend assets. The frontend uses `/api` on the same origin, so it follows the backend's current port automatically. Session initialization uses the shared request helper and shows a message if the backend is unavailable.

The profile overlay displays every card, including newly created profiles. Gallery images use horizontal scroll snapping, dots/counter, arrow buttons, and a fullscreen lightbox with keyboard/touch navigation. The four manually maintained member pages remain as they were; their links are shown from the overlay rather than causing automatic redirects.

The frontend uses `credentials: 'include'` for API calls. A separately hosted frontend can set `window.PITCHR_API_BASE = 'http://localhost:8081/api'` before loading `script.js`. The default CORS allowlist is `http://localhost:5500` and `http://127.0.0.1:5500`; set `ALLOWED_ORIGINS` to your deployed frontend origin(s).

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

For Supabase, enable the `supabase` profile and use `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, and `SUPABASE_DB_PASSWORD` instead of the local `DB_*` settings. The PostgreSQL JDBC driver and Flyway PostgreSQL module are bundled. Keep the API and frontend on the same site when deploying, configure HTTPS, and set COOKIE_SECURE=true. Profile editing/admin authentication and server-side mail delivery are outside the current frontend flow.

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
