# Rizzume

A team portfolio and collaboration app built with Spring Boot, Java 17, and a vanilla JavaScript frontend. Spring Boot serves both the API and the files in `FRONTEND`; only one application process is needed.

## After pulling changes

Install a **Java 17 JDK** and Git. Maven is supplied through the wrapper; a separate Maven installation is unnecessary. Node.js is optional and is used only to run frontend tests. There is no `npm install` or frontend development server to start.

Stop the old backend first, then run these commands from your repository folder:

```powershell
git pull
cd BACKEND
.\mvnw.cmd spring-boot:run
```

Open **http://localhost:8080/**. The first run downloads Maven/dependencies as needed. Keep the terminal open; use Ctrl+C to stop the app. Restart after pulling Java changes or updating bundled frontend resources.

### Option A: local database

The command above automatically creates the H2 database at `BACKEND/data/pitchr.mv.db` and applies the included Flyway migrations. No `.env` or database installation is required.

Each developer has separate local accounts and data. Seeded portfolio cards are not login accounts: register through `/register.html` and create your own profile. Always start from `BACKEND` to reuse the same database file.

### Option B: shared Supabase database

To use the team's existing application accounts and saved data, use the same Supabase database as the team. From `BACKEND`, create your local configuration **only if it does not already exist**:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Fill in these properties using the team's actual database connection details:

```properties
SUPABASE_DB_URL=jdbc:postgresql://YOUR_SESSION_POOLER_HOST:5432/postgres?sslmode=require
SUPABASE_DB_USERNAME=postgres.YOUR_PROJECT_REF
SUPABASE_DB_PASSWORD=YOUR_DATABASE_PASSWORD
```

Use the exact Session pooler host and username from Supabase's Connect panel. Replace every placeholder. The file uses Java properties syntax: no surrounding quotes and no `export` prefix. A literal backslash in a value must be doubled. `.env` is ignored by Git, so teammates configure it separately.

Start the Supabase profile:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=supabase" "-Dspring-boot.run.arguments=--server.port=8081"
```

Open **http://localhost:8081/**. Flyway applies pending migrations automatically in the `pitchr` schema. The database role must have permission to apply them. Do not rename or edit migrations that have already run.

These application accounts are stored in `pitchr.accounts`, not Supabase Auth's `auth.users`. Local H2 accounts and shared Supabase accounts are independent; switching the run command does not transfer accounts or passwords between them.

V7 assigns the existing `reychee06@gmail.com` account to `chee-reynaldo` when the migration first runs. If that account is created afterward, a trusted operator must verify and link it separately. Public registration cannot claim an existing seeded profile just by matching its email or name.

### Optional collaboration configuration

Video call invitations and the team inbox require a private `TEAM_INBOX_KEY`. With Supabase, set it in `.env`. With local H2, the default profile does not load `.env`; set it in the same PowerShell session before starting:

```powershell
$env:TEAM_INBOX_KEY = "your-private-team-key"
.\mvnw.cmd spring-boot:run
```

TURN relay settings are optional for calls across restrictive networks. See `BACKEND/.env.example` and [the backend guide](BACKEND/README.md) for the complete settings.

## Current features

- Responsive discovery deck, team directory, saved matches, profile galleries and full-screen image viewing.
- Registration, login, logout confirmation, persistent account workspaces, and server-enforced ownership of profile edits and photos.
- Profile editor with separate sections, project editing, image upload/reordering, live preview, validation and unsaved-change protection.
- Messaging with search/unread filters, empty/loading/error states, read receipts and per-conversation drafts held in memory.
- Protected team inbox, video calling, location sharing and saved notifications with read controls.
- Confirmed match removal that persists to the database and updates the matches and inbox without deleting message history.
- Own profiles stay visible in the directory for editing but are excluded from discovery and matches. The server rejects self-matches, self-messages and self-calls. V8 clears existing self-connections on backend restart without deleting message history.
- Resume PDF download from My profile or the account menu, using saved profile details, skills, projects, highlights and public contact links.
- Batched profile/gallery reads, concurrent initial requests, and cached profile updates to reduce unnecessary loading.

## Share the local app with ngrok

Keep Spring Boot running and forward the tunnel to its actual port. For the Supabase command above, use a second terminal:

```powershell
ngrok http 8081
```

Open the resulting HTTPS forwarding URL. The same tunnel serves both the frontend and `/api` routes. If Spring Boot runs on port 8080, use `ngrok http 8080` instead. The tunnel must point to the Spring Boot process for login, profile data and messages to work.

Restart Spring Boot after pulling these changes, then reload the tunnel page. Native forwarded-header handling lets the backend recognize HTTPS from a trusted local proxy and keeps same-origin login checks working.

API requests use `Accept: application/json` and add `ngrok-skip-browser-warning: 1` on ngrok hosts. The initial page visit may still show ngrok's Visit Site screen. Account errors now distinguish tunnel HTML responses, an unreachable backend and a missing account route. A working `/api/auth/me` returns JSON (for example `{"authenticated":false,"user":null,"expiresAt":null}` while signed out). If the tunnel rewrites the upstream Host header, add the exact public origin to `ALLOWED_ORIGINS` and restart the backend. Do not enable arbitrary origins.

## Tests

From the repository root, with Node.js installed:

```powershell
node --test FRONTEND/tests/*.test.cjs
```

From `BACKEND`, a focused backend suite that does not open a listening HTTP port:

```powershell
.\mvnw.cmd "-Dtest=AccountWorkflowTests,PortfolioWorkflowTests,OwnershipMigrationTests,ProfileLoadingTests,PublicProfileWriteTests" test
```

The full suite is `.\mvnw.cmd test`; its HTTP/embedded PostgreSQL checks need an environment that allows local connections. Tests use isolated databases rather than the team's Supabase data.

## Include with your commit

Commit new source files as well as modified files, including the account classes, all migrations (including V8), frontend JS/CSS, `resume.js`, and the complete `FRONTEND/vendor` directory with its license. The PDF dependency is already bundled, so teammates do not need to install it. Keep `.env`, `BACKEND/data`, and `BACKEND/target` local; they are ignored by Git.
