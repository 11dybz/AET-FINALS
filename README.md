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

V11 links these existing accounts to their team profiles on backend startup:

| Account email | Profile |
| --- | --- |
| johngregdapog07@gmail.com | DAPOG, John Greg |
| villanuevajustin270@gmail.com | VILLANUEVA, Justin |
| fontelardave85@gmail.com | FONTELAR, Dave |

The accounts must exist before V11 runs. It preserves existing profile ownership and skips conflicting assignments. Accounts registered afterward or skipped due to a conflict need a separate trusted assignment. Restart the backend using the team's Supabase profile to apply these links to the shared database, then reload the account workspace.

### Optional collaboration configuration

Accepted connections can message and call each other using their own accounts. The optional administrative team inbox requires a private `TEAM_INBOX_KEY`. With Supabase, set it in `.env`. With local H2, the default profile does not load `.env`; set it in the same PowerShell session before starting:

```powershell
$env:TEAM_INBOX_KEY = "your-private-team-key"
.\mvnw.cmd spring-boot:run
```

TURN relay settings are optional for calls across restrictive networks. See `BACKEND/.env.example` and [the backend guide](BACKEND/README.md) for the complete settings.

## Current features

### Snap Camera Kit lenses

During a video call, open **Effects → Snap Lenses → Enable Snap Lenses**, then choose a lens. The processed capture track is sent to the other caller. Camera and microphone controls, device changes, Original, and ending the call retain their usual behavior. Lens audio is muted separately so it cannot bypass call audio controls.

Local staging configuration is in `FRONTEND/camera-kit-config.js`, which is ignored by Git. On another machine, copy `FRONTEND/camera-kit-config.example.js` to that filename and fill in the Camera Kit **Web API token** and lens group IDs from your Snap app. This token is intended for browser SDK use; never put an OAuth client secret there. Spring Boot packages the configuration with the frontend. Restart the backend after changing packaged assets, then refresh the website.

The current group contains Snap's demo lenses, rather than the entire Snapchat Lens catalog. Add your own compatible lenses through Lens Scheduler and update the configured group IDs. Staging is for development; public release needs the appropriate Snap production approval and production token. The bundled SDK is Camera Kit Web 1.14.0; its runtime and lens assets still download from Snap, so an Internet connection is required. The SDK loads only after the user enables Snap Lenses.

Run call and effect checks with `node --test FRONTEND/tests/calls.test.cjs FRONTEND/tests/camera-kit.test.cjs FRONTEND/tests/call-filters.test.cjs`.

### Call alerts and chat history

Incoming calls show an Answer/Voice/Decline card and play a repeating ringtone. If the browser blocks sound, choose **Enable ringing sound** on the card. The header bell's **Enable browser alerts** option also enables desktop call notifications. Keep the website open to receive incoming alerts; call checks continue in background tabs, subject to browser throttling. Ringing stops when the invitation ends, expires, is declined or answered, or you leave the workspace.

Both participants see saved call events in their conversation: **Call ended** with the time since answering, **Missed call** for unanswered/expired invitations, and **Call declined**. These entries also appear in inbox previews. Repeated hangups produce one event. Server cleanup handles invitations after 90 seconds and disconnected calls even when both browsers close. This saves call history only; it does not capture audio or video.

Restart Spring Boot after pulling. Flyway **V12** adds the history fields automatically; no database reset or new dependencies are needed. Existing calls are not backfilled. Check with `node --test FRONTEND/tests/call-alerts.test.cjs FRONTEND/tests/calls.test.cjs` and, from `BACKEND`, `.\mvnw.cmd "-Dtest=ConnectionWorkflowTests,LocationSharingTests" test`.

### Portfolio and collaboration

- Responsive discovery deck, team directory, connection requests, accepted connections, profile galleries and full-screen image viewing.
- Registration, login, logout confirmation, persistent account workspaces, and server-enforced ownership of profile edits and photos.
- Profile editor with separate sections, project editing, image upload/reordering, live preview, validation and unsaved-change protection.
- Messaging with search/unread filters, empty/loading/error states, read receipts and per-conversation drafts held in memory.
- Protected team inbox, video calling, location sharing and saved notifications with read controls.
- Live video call filters: color looks, puppy/cat lenses, heart eyes, sunglasses, a crown, and meme effects. The rendered camera track is sent to the other caller; selecting Original restores the camera without ending the call.
- Confirmed connection removal for both people that closes messaging and calls without deleting message history.
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

## Connection requests and connections

1. Both people register and create their own profile. Each account manages only its own profile.
2. A right swipe or **Send connection request** sends a pending request. A super like marks the request as a priority; it still needs acceptance.
3. Open **Connections → Incoming** to accept or decline. **Sent** lets the sender cancel a pending request.
4. Accepted requests appear under **Connections** for both people. They share a single conversation, unread counts, and video call invitations in the normal account workspace; no team key is needed.
5. Either person can remove the connection with confirmation. Messaging and calls close for both people, and history stays saved. A new request can be sent after one minute and must be accepted again before history and messaging reopen.

Pending and connected profiles leave the discovery deck and remain available in the directory. Requests cannot be sent to your own profile. Duplicate requests and crossed requests do not create duplicate connections or imply acceptance. Activity refreshes while the workspace is open.

Seeded portfolio cards are not accounts. Requests to a card without a linked owner clearly show that they are waiting for the owner to activate their account. A trusted operator must verify ownership before linking an existing seeded card; public registration cannot claim someone else's profile.

Restart Spring Boot after pulling this change. Flyway **V9** converts old saved likes from accounts with profiles into pending requests, preserves and combines reciprocal conversation histories, and ends calls that predate the consent flow. Existing connections need the recipient's approval before messaging resumes. All developers must use the same Supabase profile/database to share accounts and requests.

## Location sharing in chat

Open an accepted connection's conversation and choose **Share location** (the map pin). Select **Use my location**, preview the approximate pin, enter a place name or label, and choose **15 minutes** or **1 hour** before sending. The message displays an embedded map, label, **Open directions**, and a countdown. The sender can choose **Stop sharing** on the card. A replacement share ends that sender's previous share in the same conversation.

This shares a fixed approximate pin, not live tracking. Expired and stopped cards remove their map and directions; the server omits coordinates and the label from subsequent message, inbox and location responses. Stopping also erases the saved coordinates and label. The recipient's open conversation refreshes sharing status on its regular four-second poll. Previously viewed locations or opened external directions cannot be recalled.

Device location needs browser permission and HTTPS (or localhost). Maps use OpenStreetMap; directions open Google Maps. No additional API key is required. The Location and Notifications sidebar tabs are removed; header shortcuts remain available.

Restart Spring Boot after pulling: Flyway **V10** adds location fields to messages automatically. No database reset or additional dependencies are needed. Run `node --test FRONTEND/tests/chat-location.test.cjs FRONTEND/tests/ui.test.cjs` and, from `BACKEND`, `.\mvnw.cmd "-Dtest=LocationSharingTests,ConnectionWorkflowTests" test` to check location rendering, expiry, permissions, stopping and conversation access.

## Video call filters

Open a connected conversation and choose the phone button for a voice call or the camera button for a video call. Incoming calls offer voice and video answers. During the call, select **Effects**. Choose **Looks**, **Face lenses**, or **Memes**, and select an effect. **Remove filter** restores the original camera. Camera mute also disables the filtered video, and ending a call stops all filter tracks and processing.

Filters are available in the account workspace and the team inbox. No installation, API key, or backend setting is needed. The first face lens loads MediaPipe Tasks Vision 0.10.21 and Google's Face Landmarker model over HTTPS; face tracking runs in the caller's browser. If those assets cannot load, face lenses pause with a retry option. Overlays disappear when tracking loses the face; they are never pinned to the center of the live video. Color looks and frame memes work without the tracking download. These are original effects inspired by common social camera filters, not the Snapchat SDK.

Rendering supports up to 1280 x 720 at 30 fps, with adaptive face-detection frequency, softer shaded lenses, photo previews, and a 0-100% strength slider. Microphone and camera buttons show their current states. Start video during a voice call, mute local speaker playback, change camera/microphone/speaker under **Devices**, or use the fullscreen button beside Close. Device changes preserve mute state and the selected effect, and failed changes keep the previous device. The call timer starts only when media connects.

For a two-device check, accept a connection between two accounts, start a call, select Breaking news, and confirm its red banner appears on the other device. Switch to Puppy and move your head to check tracking. Turn the camera off to verify the other device sees black video, then turn it back on and remove the filter. TURN configuration still determines whether calls can connect across restrictive networks.

## Tests

From the repository root, with Node.js installed:

```powershell
node --test FRONTEND/tests/*.test.cjs
```

From `BACKEND`, a focused backend suite that does not open a listening HTTP port:

```powershell
.\mvnw.cmd "-Dtest=AccountWorkflowTests,ConnectionWorkflowTests,ConnectionMigrationTests,PortfolioWorkflowTests,OwnershipMigrationTests,SelfMatchMigrationTests,ProfileLoadingTests,PublicProfileWriteTests" test
```

The full suite is `.\mvnw.cmd test`; its HTTP/embedded PostgreSQL checks need an environment that allows local connections. Tests use isolated databases rather than the team's Supabase data.

## Include with your commit

Commit new source files as well as modified files, including the account classes, all migrations (including V9), frontend JS/CSS, `resume.js`, and the complete `FRONTEND/vendor` directory with its license. The PDF dependency is already bundled, so teammates do not need to install it. Keep `.env`, `BACKEND/data`, and `BACKEND/target` local; they are ignored by Git.
