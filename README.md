# Compare Sketch ✏️

A web application for aligning and comparing two similar pencil/charcoal sketch photographs, detecting minor changes between them.

## Features

- **Image Upload**: Drag-and-drop or browse for two sketch images (reference and source)
- **Source Rotation**: Rotate the source clockwise in 90° steps before aligning
- **App navigation**: A top bar switches between **Compare**, **Measure** (enabled once a reference is loaded; measures the current part when opened from Compare parts), and **History**
- **Unified Comparison Workspace**: Switch between Originals, Auto align, and Manual align without leaving the images. Previously computed alignments are kept, so switching back is instant; **Edit anchors** reopens a manual alignment's points. A hint line under the toolbar suggests the next step
- **Adaptive crosshair cursor**: Point placement in Measure, Manual anchors, and part selection uses a drawn, open-centre crosshair whose centre is exactly the click point. Each arm and the centre ring independently turn black or white from the pixels beneath them (with hysteresis against paper grain), so the cursor stays visible across dark strokes and light paper without covering the target pixel
- **Precision magnifier**: A small 3× lens follows point placement and dragging in manual anchors, calibration, measurement, and part selection, including keyboard refinement. It shows the exact target with an open-centre crosshair, stays inside the viewport, and sits away from the point so a finger does not cover the enlarged detail. The magnifier switch beside the theme control turns it on/off for every marking tool and remembers the preference in this browser (on by default). Crosshairs and point placement still work when it is off. For new manual anchors, press, move to refine, then release to place the point; cancelling the gesture discards it
- **Auto-Alignment**: Uses OpenCV.js ORB feature matching + RANSAC homography to align images
- **Manual Anchors**: Add color-paired anchor points, drag or arrow-key nudge them, undo points, and use an adjustable linked or per-image visual grid
- **Grid Detection**: Detects grid intersections on the reference image as alignment diagnostics
- **Comparison Views**:
  - Side-by-side: reference vs aligned source
  - Overlay: blend aligned source on top of reference with adjustable opacity
- **Compare Parts**: After alignment, drag a rectangle on the reference in Side by side view, then click **Compare parts**. The dedicated page shows that region from the reference and aligned source, with icon buttons for stacked or side-by-side layouts. Back preserves your selection; changing the alignment clears it. Keyboard selection supports arrow keys, Shift for 10-pixel steps, Enter to mark each corner, and Escape to clear.
- **Measure Reference**: Use **Measure** on a full reference (even without a source or alignment) or from a part. Click two grid corners on the full reference to calibrate horizontal and/or vertical spans, optionally entering each span's size on paper and a unit. Calibration saves immediately in IndexedDB, keyed by reference image content, and is shared by every comparison and part of that reference. Redo replaces the single calibration; its endpoints can be dragged or arrow-key nudged. To measure, click once to anchor Point 1, then move the cursor for live horizontal/vertical percentages and optional paper-unit distances along a single dashed guide. Every subsequent click replaces Point 1 and starts a new measurement, rather than fixing a second point. Hold Shift to temporarily hide the moving cursor, guide, on-image distance labels and magnifier; release it to restore them without resetting their positions. The fixed anchor and sidebar readouts remain visible, and measurement continues while hidden. Arrow keys move the cursor, Enter anchors a new Point 1, and Tab to the anchor allows arrow-key refinement, with Shift for 10 pixels. Escape or **New** clears the anchor. Fit/2×/4× zoom does not change distances. Measurements are temporary and disappear when leaving the tool. This measures image-space proportions, not perspective-correct physical lengths.
- **History**: Save a timestamped alignment under a project, then save named parts and notes from the Parts view. A project can contain many comparisons sharing a reference filename. Reopen an entry with its saved images and alignment, or use the dashed **New comparison with this reference** tile in Comparisons to compare a new source against the saved reference. Images and metadata stay in this browser's IndexedDB. Identical reference files are stored only once, matched by SHA-256 content hash; source files remain stored per entry. Existing history automatically migrates to shared reference storage, and a reference is removed only when no entries use it. Exports retain the self-contained format with both images in each entry.
- **Aligned Source Download**: In History, select a project and use the download icon beside **Comparisons**. Its saved source rotations and alignments are applied, then up to 99 lossless PNGs are automatically downloaded in one compressed ZIP. Photos are sorted newest first by EXIF `DateTimeOriginal`, including timezone offsets and subseconds when present, not by comparison-save or file-modification date. Names use the project name (with unsafe filename characters replaced by underscores) followed by `_01` through `_99` before `.png`, for example `Capture Study_01.png`. Entries beyond 99 are ignored. Photos without readable capture metadata are placed last, ordered by source filename, and reported in the completion notice. EXIF dates without an offset use the browser's local timezone. Browser settings may prompt for a download location. This does not change saved source images or the existing full-data JSON export.

## Tech Stack

- **Svelte 5** (runes syntax)
- **OpenCV.js 4.9** (self-hosted from `public/vendor`)
- **Vite 8**
- **Bun** (package manager & runtime)

## Getting Started

```bash
# Install dependencies
bun install

# Configure the shared Supabase project (see Authentication setup below)
cp .env.example .env.local

# Start dev server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Authentication setup (shared Supabase identity)

This is a **client-only Svelte 5/Vite SPA**, not SvelteKit or SSR. It uses
`@supabase/supabase-js` with PKCE, browser-local session persistence, automatic
token refresh, and one root auth subscription that is removed on teardown.
`@supabase/ssr` and cookie-backed server clients are not appropriate here because
there is no server rendering or trusted server endpoint. If SSR is added later,
use per-request cookie-backed clients and verify users/claims on the server.

The comparison app is mounted only after session initialization and successful
authentication. Email registration, email/password sign-in, Google sign-in,
confirmation/OAuth callbacks, password recovery, and sign-out are provided.
Sign-out unmounts the comparison workspace and releases its browser resources;
saved IndexedDB history is retained. **History is browser-local, not account
scoped or synced**: other accounts signing in on the same browser profile see
the same saved data. This UI gate is not a security boundary for data already
stored on the device. Any future remote data must use Supabase RLS and verified
identity at trusted boundaries; browser `getSession()` is for UI state only.
The two apps share user IDs through one Supabase project but have independent
browser sessions on separate origins. Six-month entitlements are out of scope.

### Required configuration (not supplied by this repository)

1. Use the **same Supabase project** as the other application. From its API
   settings, set these in `.env.local` for local development and in the hosting
   provider's build environment for production:
   - `VITE_SUPABASE_URL`: the actual project's HTTPS URL.
   - `VITE_SUPABASE_ANON_KEY`: its **public publishable key** (`sb_publishable_…`)
     or legacy **anon** key. The variable name is retained for either public key.
   Restart Vite after changing env values; rebuild/redeploy to change production
   values. Missing configuration shows a blocking setup message, not an auth
   bypass. All `VITE_` values are exposed in the built browser bundle.
   **Never use a service-role/secret key, database password, JWT signing secret,
   or Google client secret.** `.env` and `.env.*` are ignored except this example.
2. Enable the Email provider, email signup, and **Confirm email** in Supabase
   Authentication. Configure a production SMTP sender and password policy
   (the UI requires at least 8 characters for new passwords; Supabase enforces
   the actual policy). Keep confirmation/reset templates using Supabase's
   `{{ .ConfirmationURL }}` so Supabase verifies the link and redirects to the
   requested app. Do not replace it with a hard-coded Site URL or an SSR
   token-hash endpoint this SPA does not implement. Test both email deliveries.
3. In **Authentication → URL Configuration**, set Site URL to the shared
   project's chosen primary production app. Add **exact** Redirect URLs for
   each approved origin of **both** applications:

   | Origin | Callback | Password reset |
   | --- | --- | --- |
   | Compare Sketch default local dev | `http://localhost:5173/auth/callback` | `http://localhost:5173/auth/reset-password` |
   | Each actual production/approved preview origin | `<app-origin>/auth/callback` | `<app-origin>/auth/reset-password` |

   Replace placeholders with the actual origins, without a trailing slash.
   If Vite uses another port, allowlist that exact origin too (or start with
   `bun run dev -- --strictPort`). Avoid broad production wildcards. The app
   derives redirects from `window.location.origin`, never a caller-provided
   `next` URL. Approved orb portals also require their exact callback/reset
   URLs; a portal URL does not automatically authorize a Supabase redirect.
4. In Google Cloud, create/configure a Web application OAuth client and consent
   screen. Add the approved app origins as Authorized JavaScript origins and
   register the **exact callback URL displayed by Supabase's Google provider**
   as the Authorized redirect URI (normally
   `https://<actual-project-ref>.supabase.co/auth/v1/callback`, not this app's
   `/auth/callback`). Configure consent/test users or publish as appropriate.
   Enable Google in Supabase and enter the Google Client ID and client secret
   **only in Supabase's provider settings**, never in frontend env or Git.
5. Configure the static host to serve `index.html` for `/auth/callback` and
   `/auth/reset-password` as well as `/`. Vite dev/preview already provide this
   SPA fallback. Use HTTPS in production. Without fallback, email/OAuth links
   will return a host 404 before the app can handle them.

The SPA explicitly exchanges callback codes exactly once, then calls
`getSession()` before entering the workspace. PKCE requires confirmation/reset
links to be opened in the **same browser and origin where the flow started**;
an expired, reused, missing-verifier, or provider-error link shows a recoverable
error. Authorization codes are removed from the address bar after handling.
Starting another signup/reset/OAuth flow before completing the first can
overwrite the stored verifier; request a fresh link when needed.

### Verification

```bash
bun run build
bun test tests/*.test.ts
```

A repeatable mock browser check is available without live credentials. In a
disposable development environment with `agent-browser` installed, start Vite
with the **test-only** public key and mock URL below, then run the browser test.
The test starts/stops the local mock Auth endpoint, exercises the real Supabase
client, and closes its disposable browser session. Never deploy these values.

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54325 VITE_SUPABASE_ANON_KEY=sb_publishable_test_only bun run dev -- --port 5174 --strictPort
# In another terminal:
bun run tests/auth.browser.ts http://localhost:5174
```

Mock checks cannot establish that the real Google provider, SMTP sender,
production redirects, or remote password policy are correctly configured.
Before going live, verify signup → email confirmation, email/password login,
Google consent → callback, reset email → password update → login with the new
password, refresh persistence, and sign-out on the actual deployed origin.

## Docker / hosted InstaCloud deployment

The production image builds with pinned Bun and a frozen lockfile, then copies
only `dist/` into a digest-pinned, non-root nginx image. It listens on `0.0.0.0:8080`
by default (`PORT` can override it), provides `/healthz`, and falls back to the SPA
for `/auth/callback` and `/auth/reset-password`. Hashed Vite assets are immutable;
HTML and the pinned OpenCV file revalidate. Missing scripts return 404. Callback
query strings are omitted from access logs. No database, storage service, volume,
or Supabase secret is needed by this browser-only app.

Follow the current [InstaCloud introduction](https://docs.instacloud.com/introduction),
[canonical agent setup](https://instacloud.com/prompt.md), and installed `insta`
skill. InstaCloud recommends a static host for an SPA whose backend lives elsewhere;
this container is provided for an explicitly chosen hosted-compute deployment.

### Build configuration

`VITE_` variables are compiled into JavaScript. Setting InstaCloud **runtime**
secrets does not configure this build. Docker accepts the two public build args:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t compare-images:production .
docker run --rm -p 8080:8080 compare-images:production
```

The current InstaCloud source-deploy CLI has no build-arg option. Instead copy
`deploy/public-build.example.json` to **Git-ignored** `deploy/public-build.json`
and fill in **only** the actual shared project's HTTPS URL and **public**
publishable/anon key. That file takes precedence over Docker build args. Do not
put a service-role key, private token, password, or any other variable in it.
Unlike `.env*`, this deliberately public-only file enters the remote Docker build
context. All other local env files and `.insta` credentials are excluded.

Validate the public file **before uploading** it with `insta deploy`:

```bash
bun run deploy/build.ts
```

The container build fails if either value is missing, a privileged key is used,
or the JSON contains extra fields. Rebuild/redeploy when public values change;
the runtime image contains neither Bun nor the build configuration file.

### Hosted deployment

This branch is linked to the independent **compare-images** project
`4913e2a8-2bca-4220-aee5-d9b309f93df7`, InstaCloud branch `instacloud-deploy`,
compute service `web` (port 8080, scale-to-zero). The separate `insta-auth`
project is not part of this deployment. A fresh clone inherits the project
binding but must authenticate and establish its own agent session.

```bash
npx -y insta@latest --agent agent setup --yes
insta --agent status --json
insta --agent login --device  # if needed; owner approves the printed link/code
# Only if NOT already linked, the owner chooses ONE:
insta --agent project create compare-images
# OR: insta --agent project link <existing-project-id>
insta --agent agent setup --yes
insta --agent agent policy get --json
# Only if the branch/service does not already exist:
insta --agent branch create instacloud-deploy
insta --agent branch switch instacloud-deploy
insta --agent service add compute web --port 8080
bun run deploy/build.ts
insta --agent build . --port 8080 --explain
insta --agent deploy . --branch instacloud-deploy --group web --port 8080
insta --agent agent manifest --json
```

If the directory is already linked, reuse the project and inspect its branches
and services instead of creating duplicates. Commit `.insta/project.json` once
linked; never commit `.insta/agent-session.json` or login credentials. Relay any
approval gate to an owner/admin; an agent must not approve itself.

Poll the printed HTTPS URL until it serves 200 (allow a cold start), then run
`bun run tests/deploy.http.ts <live-url>`. Add that exact origin's `/auth/callback`
and `/auth/reset-password` to the shared Supabase Redirect URLs, preserving the
other app's entries and primary Site URL. Complete the live email/Google flows
listed above. The default InstaCloud URL needs no DNS changes. For a custom
domain, the owner first chooses the hostname; `insta --agent domain attach
<hostname> --branch instacloud-deploy --group web` prints the DNS records to add
at the registrar. Wait for TLS/domain verification, then allowlist the custom
origin in Supabase too. Do not change nameservers or purchase a domain implicitly.

### Container verification without live credentials

```bash
bun run build
bun test tests/*.test.ts
# Ensure deploy/public-build.json is absent so these TEST-ONLY args are used:
docker build \
  --build-arg VITE_SUPABASE_URL=http://127.0.0.1:54325 \
  --build-arg VITE_SUPABASE_ANON_KEY=sb_publishable_test_only \
  -t compare-images:auth-test .
docker run --rm -p 8080:8080 --read-only --tmpfs /tmp \
  --tmpfs /etc/nginx/conf.d:uid=101,gid=101 \
  --cap-drop ALL --security-opt no-new-privileges compare-images:auth-test
# In another terminal (Linux; browser and mock Auth run on the host):
bun run tests/deploy.http.ts http://localhost:8080
bun run tests/auth.browser.ts http://localhost:8080
```

Never deploy this test image or the mock public configuration. Browser tests run
the real Supabase client against a local mock, not live SMTP or Google settings.

## Amp Orbs

`.agents/setup` uses Bun and Node from Amp's base image and installs dependencies
with `bun install --frozen-lockfile`. Amp snapshots the prepared environment so
fresh orbs can reuse it; a warm setup checks the lockfile without reinstalling
unchanged dependencies. Setup requires no secrets or additional system packages;
running the app requires the public Supabase configuration above.
`.agents/resume` only checks readiness and never installs dependencies.

Start the supervised development server and get its authenticated portal URL:

```bash
amp orb services ensure
```

The service in `.amp/services.yaml` survives pause/resume. Vite accepts portal
hostnames only inside an orb. Generated `.amp/portals/` files are Git-ignored.
Run `bun run build` to verify the production bundle; there is no dedicated test
or lint script.

## How It Works

1. Load two sketch photographs (reference and source with changes)
2. Choose one comparison method in the shared workspace:
   - **Visual** shows the untouched originals side by side
   - **Manual anchors** uses 4+ complete matching point pairs for homography
   - **Auto align** uses ORB feature detection, BF matching, Lowe's ratio test, and RANSAC
3. In Manual anchors, click matching locations, drag or nudge points to refine them, and optionally enable and position a visual grid
4. Apply the anchors or run automatic alignment to warp the source into the reference coordinate space
5. Inspect aligned results using Side-by-Side or Overlay, and save the comparison and selected parts if desired

## OpenCV Architecture

OpenCV.js is served as a local, pinned browser asset at `public/vendor/opencv-4.9.0.js`.
This follows OpenCV's documented browser loading model: define
`Module.onRuntimeInitialized` before loading `opencv.js`, then run CV code after
`cv.Mat` is available.

I tested moving OpenCV into a Web Worker, which would be preferable for large
images, but the prebuilt OpenCV.js WASM bundle hangs during worker bootstrap in
this Vite app. The current implementation keeps a promise-based API boundary in
`src/lib/opencv.ts`, so the CV implementation can later move to a custom worker
build or backend service without changing the Svelte components.

## MVP Limitations

- OpenCV.js is self-hosted but still large (~10MB, cached after first load)
- OpenCV alignment remains on the main thread with resolution-bounded feature detection
- Grid detection works best with clear, high-contrast grid lines
- Saved comparisons include both original image files, alignment, notes, and part previews in IndexedDB. Reopen from History without selecting files again; source rotations are reapplied before restoring alignment.
- Storage is local to this browser/profile and can be evicted or removed by clearing site data. The header shows estimated total site usage against the browser's quota (not an IndexedDB-only limit): green below 60%, amber at 60%, red at 80%. Estimates refresh after saving/deleting and when the window regains focus; some browsers do not provide estimates.
- Calibration remains available when the same reference file is selected again, even without a saved comparison. JSON history backups include calibration for references in saved comparisons; calibration-only references are not included. Import restores missing calibrations but keeps an existing local calibration. Measurements are never included in backups.
- History's **Export all** downloads a versioned JSON file containing base64-encoded original images and all saved metadata. Use **Import** next to it to restore a version-2 JSON backup. Existing projects (name and reference filename), entries (ID), and parts (ID within an entry) are kept, not replaced; new entries join existing projects and missing parts are appended to existing entries. A completion summary reports imported and already-existing project, entry, and part counts. Invalid backups are rejected before any data is written. Export does not delete data.
- The version-2 database resets old metadata-only history without migration. Saving multiple comparisons currently stores a separate copy of their images in each entry.
