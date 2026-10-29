# pitchr. backend

Spring Boot 4.1.2, Java 17, Maven Wrapper, Spring MVC, Spring Data JPA, Bean Validation, and Flyway. Supports Supabase PostgreSQL through the `supabase` profile, with file-backed H2 for local development.

## Run on Windows

From the repository root:

```powershell
cd BACKEND
.\mvnw.cmd spring-boot:run
```

Java 17 or newer must be installed. The wrapper downloads Maven and dependencies on the first run. The API runs at `http://localhost:8080/api`. There is no HTML landing page at `/`.

```powershell
# Run integration tests against isolated H2 and PostgreSQL databases
.\mvnw.cmd test
# Build an executable application
.\mvnw.cmd package
java -jar target/pitchr-backend-0.0.1-SNAPSHOT.jar
```

The application creates `BACKEND/data/pitchr.mv.db` when launched from BACKEND. Always use the same working directory to reuse the same database. Flyway creates the schema and seeds the four members, skills, highlights, and projects from the frontend once. Database files and build output are ignored by Git. Existing placeholder contact addresses, social links, and static match percentages are preserved as demo content.

## Connect to Supabase

1. In your Supabase project, open **Connect → Session pooler** and copy the database host, port, database name, and username. Use the exact host and username shown; the shared pooler username is typically `postgres.PROJECT_REF`. The session pooler on port 5432 works on IPv4 networks and supports the backend's persistent connections and prepared statements. See the [Supabase Spring Boot guide](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot).
2. Edit `BACKEND/.env`, which is ignored by Git. If it does not exist, copy `.env.example` to `.env`. Fill in:

```properties
SUPABASE_DB_URL=jdbc:postgresql://YOUR_SESSION_POOLER_HOST:5432/postgres?sslmode=require
SUPABASE_DB_USERNAME=postgres.YOUR_PROJECT_REF
SUPABASE_DB_PASSWORD=your-database-password
```

Use the **database password**, not an anon, publishable, or service-role API key. Keep the password in its separate property, outside the URL. This `.env` is loaded as a Java properties file: do not surround values with quotes, prepend `export`, or URL-encode the separate password. Double any literal backslashes in the password, or use OS environment variables instead. OS environment variables override the file. The file is loaded from the current working directory only when the supabase profile is enabled.

3. From `BACKEND`, start with the Supabase profile on port 8081:

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

The existing FRONTEND files are still standalone and have not been changed. To connect them:

1. Load `/api/profiles` into `PROFILES` and `cardsState` during initialization.
2. POST `/api/session`, then load `/api/me/matches` and call `updateMatchesUI()`.
3. Map left/right/up to pass/like/super_like in `finalizeSwipe()`. Await a successful PUT before showing a match or removing the card. Disable swipe input during the request/animation and allow retries on failure.
4. Read the team email from `/api/team` for `copyTeamContact()`.
5. Add loading/error states and escape API text used in HTML templates; validate external link protocols.

Use `credentials: 'include'` on API calls so the browser sends the session cookie:

```javascript
const API = 'http://localhost:8080/api';
await fetch(`${API}/session`, { method: 'POST', credentials: 'include' });
const response = await fetch(`${API}/me/swipes/chee-reynaldo`, {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'like' })
});
if (!response.ok) throw new Error('Could not save swipe');
```

Serve FRONTEND over HTTP (for example a local editor server on port 5500); opening `index.html` as a file is not supported by the API's origin policy. Use `localhost` for both servers, or `127.0.0.1` for both, so SameSite cookies work. The default allowed frontend origins are `http://localhost:5500` and `http://127.0.0.1:5500`.

## Configuration

Set environment variables before starting the application:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | API port |
| `DB_URL` | `jdbc:h2:file:./data/pitchr;WRITE_DELAY=0` | Database location; flush committed writes immediately |
| `DB_USERNAME` | `sa` | Database username |
| `DB_PASSWORD` | empty | Local database password |
| `TEAM_EMAIL` | `team.leads@example.com` | Team contact |
| `ALLOWED_ORIGINS` | localhost/127.0.0.1 on port 5500 | Comma-separated frontend origins |
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
