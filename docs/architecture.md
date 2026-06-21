# Findias Architecture

This document describes **how Findias works from a technical (code and
technology) standpoint**. It explains the runtime model, process boundaries,
external integrations, data flow, and the modules required to deliver the
features defined in [`project-overview.md`](./project-overview.md), within the
modding constraints documented in [`game-structure.md`](./game-structure.md).

It deliberately focuses on _engineering_ concerns. For _what_ the mods do and
_why_ the folder rules exist, read the two documents linked above first.

## Design goals and constraints

These constraints drive every decision below:

1. **No hosting or storage cost.** GitHub Releases is the file host. Findias
   only ever reads from GitHub and writes to the user's local disk.
2. **No dependencies the user must install.** The distributed app is fully
   self-contained; the user downloads one executable and runs it.
3. **No server, no database.** There is no Findias backend. The two sources of
   truth are external and local:
   - The **GitHub release** of Uiscias = what mods exist and their versions.
   - The **`package` folder** on disk = what is installed / disabled / stale.
4. **No persisted mod catalog.** The available-mods list and installed-mods list
   are rebuilt from those two sources on every launch and held only in memory.
   The only thing persisted is user settings (chiefly the chosen game path).

## Technology stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| App shell | **Electron** | Bundles Chromium + Node + app into one self-contained executable; gives the renderer DOM/UI and the main process full filesystem + network access. |
| UI | Renderer web stack (HTML/CSS + a component framework, e.g. React) | Standard, fast to build a scrollable mod list. Framework choice is not load-bearing for this architecture. |
| Network | Electron `net` module (preferred) or Node `fetch` | Built in; follows redirects; no third-party HTTP dependency. |
| Filesystem | Node `fs` / `fs/promises`, `path` | Built in; all package-folder operations. |
| Folder picker | Electron `dialog.showOpenDialog` | Built in; native directory chooser. |
| Settings store | JSON file in `app.getPath('userData')` | Built in; no `electron-store` strictly required. |
| Packaging | **electron-builder** (dev-only dependency) | Produces a Windows installer / portable `.exe` to attach to the Findias Releases page. |

> "No dependencies" applies to the **end user**. The build machine still uses
> normal npm dev dependencies (Electron, electron-builder, the UI framework).
> These are compiled/bundled into the shipped artifact and are invisible to users.

## Distribution model

```
tekashi-side/Findias (GitHub)        Root50199/Uiscias (GitHub)
        │ Releases                            │ Releases
        │  └─ Findias-Setup-x.y.z.exe         │  └─ Uiscias<Name>_<n>.it  (mod assets)
        ▼                                     ▼
   user downloads & runs            Findias reads release[0] assets,
   the Findias app  ───────────────► downloads chosen mods directly
                                      into  appdata\package
```

- Findias is built with electron-builder and published as a release asset on
  **`tekashi-side/Findias`**. Users get new Findias versions by downloading the
  latest release there.
- The mod `.it` files live on **`Root50199/Uiscias`** releases. Findias never
  re-hosts them; the user downloads them straight from GitHub's CDN.

## Process model

Electron splits into three contexts. Keeping a strict boundary is the core
security/architecture decision.

```
┌────────────────────────────────────────────────────────────────────┐
│  Renderer process (Chromium)                                       │
│  - UI only: mod list, buttons, progress, settings screen           │
│  - NO direct Node fs/net access (contextIsolation on,              │
│    nodeIntegration off)                                            │
│  - Talks to main exclusively through window.findias.* (preload)    │
└───────────────┬────────────────────────────────────────────────────┘
                │  IPC (typed request/response + events)
┌───────────────▼────────────────────────────────────────────────────┐
│  Preload script                                                    │
│  - contextBridge.exposeInMainWorld('findias', {...})               │
│  - Thin, allow-listed wrapper over ipcRenderer.invoke/on           │
│  - No business logic                                               │
└───────────────┬────────────────────────────────────────────────────┘
                │  ipcMain.handle(...)
┌───────────────▼────────────────────────────────────────────────────┐
│  Main process (Node)                                               │
│  - All filesystem, network, and dialog operations                  │
│  - Owns the canonical in-memory app state                          │
│  - Modules: SettingsStore, GameLocation, PackageScanner,           │
│    ReleaseClient, ModResolver, ModInstaller, Downloader            │
└────────────────────────────────────────────────────────────────────┘
```

Security posture (non-negotiable defaults): `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true` where feasible, and a preload that
exposes only a small, explicit API surface. The renderer can never read or write
arbitrary files; it can only ask the main process to perform named operations.

### Window

A single small, non-fullscreen `BrowserWindow` centered on screen
(`center: true`), non-maximized by default, with a sensible minimum size.

## IPC boundary

All renderer↔main communication goes through a single typed API exposed on
`window.findias`. Request/response calls use `ipcRenderer.invoke` /
`ipcMain.handle`; long-running progress uses main→renderer events.

```ts
// Shape exposed by the preload (illustrative, not final)
interface FindiasApi {
  // settings & setup
  getSettings(): Promise<Settings>;
  chooseGameFolder(): Promise<{ ok: boolean; path?: string; error?: string }>;

  // catalog
  refresh(): Promise<ModListState>;   // scan disk + fetch release + resolve

  // mutations
  installOrUpdate(modId: string): Promise<ModListState>;
  deleteMod(modId: string): Promise<ModListState>;
  setDisabled(modId: string, disabled: boolean): Promise<ModListState>;

  // progress events
  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void;
}
```

Design rules for the boundary:

- The renderer sends **intents keyed by mod identity** (`modId`), never file
  paths. The main process resolves identities to concrete files. This keeps all
  path/filesystem logic on one side and prevents the UI from constructing
  arbitrary paths.
- Every mutating call returns the **fresh `ModListState`** so the UI re-renders
  from authoritative state rather than guessing the result locally.

## External integration: GitHub

### Reading the available mods (release client)

- **Endpoint:** `GET https://api.github.com/repos/Root50199/Uiscias/releases`
- **Selection:** take the newest **non-draft** entry — effectively `releases[0]`
  after filtering out `draft: true`. We use the _list_ endpoint (not
  `/releases/latest`) on purpose: `/releases/latest` **excludes prereleases**,
  and Uiscias ships `-beta`/prerelease-flagged builds, which we still want to
  surface.
- **Auth:** none. Public repo, unauthenticated request.
- **Per-asset fields consumed:** `name`, `size`, `browser_download_url`,
  `content_type`, `updated_at`.
- **Filtering:** only assets whose `name` ends in `.it` **and** parse cleanly as
  a managed mod (see filename grammar) are kept. Everything else (source zips,
  notes, stray files) is ignored defensively.

Example of the response shape we depend on (verified against the live repo):

```json
{
  "tag_name": "...",
  "prerelease": true,
  "draft": false,
  "assets": [
    {
      "name": "UisciasDDtimer_00005.it",
      "size": 135779,
      "content_type": "application/octet-stream",
      "browser_download_url": "https://github.com/Root50199/Uiscias/releases/download/<tag>/UisciasDDtimer_00005.it"
    }
  ]
}
```

### Rate limits

Unauthenticated GitHub API requests are limited to **60 per hour per IP**
(confirmed via `X-RateLimit-Limit: 60`). Findias makes **one** release request
per launch (plus the user's own download actions, which hit the CDN, not the
API). This is comfortably within budget. The client should still:

- Read `X-RateLimit-Remaining` / `X-RateLimit-Reset` and surface a friendly
  "try again later" message on `403` rate-limit responses instead of failing
  silently.
- Handle offline / DNS / timeout errors and let the UI show a retry state.

### Downloading assets

- Each mod's `browser_download_url` returns a **`302` redirect** to GitHub's
  release-assets CDN, which serves the bytes with `200 OK`. The downloader must
  **follow redirects** (the `net` module and `fetch` do so by default).
- Downloads are **streamed to disk**, not buffered in memory: assets range from
  ~1 KB to **tens of MB** (the largest observed asset is ~59 MB), so streaming
  with a progress callback (`Content-Length` → percent) is required.
- Write to a **temporary file first**, then atomically rename into place on
  success. On failure/cancel, delete the temp file. This guarantees the
  `package` folder never contains a half-written `.it` that the game would try
  to load.

## Local integration: the `package` folder

### Locating the game folder

- On launch, read settings. If no game path is stored (or the stored path no
  longer contains a `package` directory), the UI shows a **setup gate**: the app
  cannot operate until a valid folder is chosen.
- `chooseGameFolder` opens the native directory picker and **validates** that the
  selection is/contains the expected layout (a `package` subfolder). The chosen
  root is the `appdata` folder per [`game-structure.md`](./game-structure.md).
- On success the path is written to the settings file and the catalog refresh
  runs.

### Scanning installed mods (package scanner)

- `fs.readdir(<gameRoot>/package)` reads the **root only** (the game ignores
  subfolders; see game-structure). Subfolders are read separately to detect
  **disabled** mods.
- Each entry is filtered to `.it` and run through the shared filename parser.
  Files that don't match the managed grammar are **left untouched and ignored**
  (official `data_XXXXX.it` and third-party mods are never modified).
- The directory is the source of truth: the scan result _is_ the installed-state.
  Nothing is cached to disk.

## Filename grammar and mod identity

Findias standardizes on the managed convention from
[`project-overview.md`](./project-overview.md#managed-mod-naming):

```
Uiscias<ModFileName>_<number>.it
```

- **Identity (`modId`)** = `<ModFileName>` (the segment between the `Uiscias`
  prefix and the final `_`). Stable across versions; used as the key to match an
  installed file to a release asset.
- **Version** = `<number>`, parsed as an **integer** for comparison. Even though
  the convention is zero-padded, the parser compares numerically so padding width
  never affects ordering.
- **Ownership** = the `Uiscias` prefix marks files Findias may manage. Files
  without it are out of scope and never touched.

A single shared parser/validator is used by **both** the package scanner and the
release client, so on-disk files and release assets are interpreted identically.

```ts
// Single source of truth for the grammar (illustrative)
const MANAGED = /^Uiscias(?<name>[^_]+)_(?<version>\d{1,5})\.it$/;

interface ParsedMod {
  fileName: string;   // exact file name on disk / asset name
  modId: string;      // <ModFileName>
  version: number;    // parsed integer
}
```

> **Upstream dependency.** Per project decision, the canonical naming convention
> is owned upstream: the Uiscias maintainer adopts `Uiscias<ModFileName>_<number>.it`
> as the published contract for release assets. Findias's parser is **strict**
> about what qualifies as a managed mod but **tolerant** of non-conforming files
> (it skips them rather than erroring). See the migration note below.

### Migration / transition handling

At the time of writing, the live Uiscias release assets do **not** yet use the
`Uiscias` prefix (e.g. `DDtimer_00005.it`, `Crom_2.it`). Until the upstream
release adopts the convention, a strict parser yields an **empty managed-mod
list**. The architecture handles this gracefully:

- The release client and scanner **skip** non-conforming assets/files silently
  (no crash, no accidental management of unowned files).
- The UI renders a clear empty state ("No compatible mods found in the latest
  release") rather than an error.

This keeps Findias correct and safe both during the upstream migration and
permanently against stray non-mod assets.

## Mod resolution (joining the two sources)

The `ModResolver` merges the release catalog and the disk scan, keyed by
`modId`, into the list the UI renders.

For each `modId` present in the release and/or on disk, compute status:

| Release has it | Installed (enabled) | Installed (disabled) | Status |
| --- | --- | --- | --- |
| ✓ | — | — | **Not installed** → show _Install_ |
| ✓ | = release version | — | **Up to date** → show _Delete_ |
| ✓ | < release version | — | **Update available** → show _Update_ + _Delete_ |
| ✓ | — | any | **Disabled** → show _Enable_ (+ _Update_ if stale) + _Delete_ |
| — | any | any | **Orphan** (installed, not in current release) → show _Delete_ only |

The resulting `ModListState` is an array of view models containing: display
name, release version, installed version (or null), status, size, and the set of
valid actions. This is exactly what the scrollable list rows render.

## Core flows

### Launch / refresh

```
app ready
  → load settings
  → valid game path? ──no──► show setup gate (chooseGameFolder)
        │ yes
        ▼
  scan package (+ disabled subfolder)      ┐ run in parallel
  GET /releases → pick newest non-draft    ┘
  → ModResolver.merge() → ModListState
  → renderer renders list (or empty/error state)
```

### Install

```
installOrUpdate(modId)
  → resolve release asset for modId
  → stream download browser_download_url → package/<tempfile>
     (emit onDownloadProgress)
  → atomic rename → package/Uiscias<modId>_<n>.it
  → re-scan + re-resolve → return ModListState
```

### Update (replace semantics)

Per [project-overview "Only the latest version may be installed"](./project-overview.md#only-the-latest-version-may-be-installed-critical),
exactly one file per `modId` may exist in `package`.

```
installOrUpdate(modId) where an older version is installed
  → download new version (temp → atomic rename into package root)
  → delete the previous version file for that modId
  → (ordering: write-new-then-delete-old, so a crash never leaves the mod
     missing; a crash mid-way at worst leaves two files, which the next
     refresh detects and reconciles down to the newest)
```

### Delete

```
deleteMod(modId)
  → find the managed file(s) for modId in package (root and disabled subfolder)
  → fs.unlink
  → re-scan + re-resolve
```

### Disable / enable (stretch)

```
setDisabled(modId, true)
  → fs.rename package/Uiscias<modId>_<n>.it
            → package/<disabledSubfolder>/Uiscias<modId>_<n>.it
setDisabled(modId, false) → reverse the move
```

The game only loads `.it` files in the **root** of `package`, so moving a file
into a subfolder disables it without deleting it (see game-structure).

## Application state

```ts
interface Settings {
  gameRootPath: string | null;   // the appdata folder
  // future: UI prefs, last-used filters, etc.
}

interface AppState {
  settings: Settings;            // persisted to userData JSON
  release: ReleaseSnapshot | null;   // in-memory only, this launch
  installed: ParsedMod[];            // in-memory only, from disk scan
  modList: ModListState;             // derived, sent to renderer
  busy: Record<string, ActionStatus>; // per-mod in-flight action + progress
}
```

- **Persisted:** only `Settings` (a small JSON file under
  `app.getPath('userData')`). No mod catalog is ever written to disk.
- **Ephemeral:** `release`, `installed`, and the derived `modList` exist only
  while the app is open and are rebuilt from the two sources on every refresh.

## Error handling and edge cases

- **No/invalid game path** → setup gate blocks all mod operations.
- **Offline / GitHub unreachable / rate-limited (403)** → refresh fails softly
  with a retry affordance; any already-installed mods (from the disk scan) can
  still be shown and deleted even without the release list.
- **Partial download / cancel / crash** → temp-file + atomic rename guarantees no
  half-written `.it` in `package`.
- **Duplicate versions found on disk** (e.g. from a crashed update or manual user
  action) → the resolver flags the mod and the next install/update reconciles to
  a single newest file.
- **Non-conforming or unowned files** in `package` → ignored, never modified.
- **Disk write failure / permissions** (e.g. game installed under a protected
  path) → surfaced to the UI with the OS error; no silent failure.

## Module responsibilities (main process)

| Module | Responsibility |
| --- | --- |
| `SettingsStore` | Load/save the JSON settings file in `userData`. |
| `GameLocation` | Validate a chosen folder, resolve `package` + disabled subfolder paths. |
| `PackageScanner` | List and parse managed `.it` files (root + disabled). |
| `ReleaseClient` | Fetch `/releases`, pick newest non-draft, parse assets, read rate-limit headers. |
| `ModResolver` | Merge release + installed into `ModListState` with status + actions. |
| `Downloader` | Stream a URL to a temp file with progress + atomic rename. |
| `ModInstaller` | Orchestrate install / update(replace) / delete / disable using the above. |
| `ipc` | Register `ipcMain.handle` endpoints; emit progress events; return fresh state. |

## Out of scope (technical)

- No background auto-updating, telemetry, or analytics.
- No packing/repacking of raw mod content (handled upstream in Uiscias).
- No management of non-`Uiscias` `.it` files.
- No authenticated GitHub access or tokens (unauthenticated is sufficient).
