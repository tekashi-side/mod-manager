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

| Concern              | Choice                                                     | Rationale                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language             | **TypeScript** everywhere possible                         | One typed language across main, preload, and renderer; shared types for the IPC contract and data models prevent drift between processes.                                                                                                                     |
| App shell            | **Electron**                                               | Bundles Chromium + Node + app into one self-contained executable; gives the renderer DOM/UI and the main process full filesystem + network access.                                                                                                            |
| Bootstrap / build    | **Vite** (via `electron-vite`)                             | Fast dev server + HMR for the renderer and a single, well-supported way to build all three Electron entry points (main, preload, renderer) with TypeScript. See note below.                                                                                   |
| UI framework         | **React**                                                  | Component model fits the scrollable mod list and setup/empty/error states; large ecosystem; first-class Vite support.                                                                                                                                         |
| Component library    | **Tailwind CSS v4 + shadcn/ui (Radix, Luma style)**        | Accessible Radix primitives whose source we own and edit in-repo (`components/ui/`), styled with utility classes; Lucide icons; the theme is preset-driven (see [Theming](#theming)) so the look stays consistent and tweakable without a runtime UI library. |
| Renderer async state | **TanStack Query (React Query)**                           | Manages loading/error/stale state, de-dupes requests, and invalidates after mutations. It wraps the IPC calls — it does **not** perform networking itself (see note).                                                                                         |
| Network              | **`fetch`** (in the main process)                          | Standard WHATWG API built into Node 18+; follows redirects; trivially mockable in Vitest. All network calls live in the main process, never the renderer.                                                                                                     |
| Validation           | **zod**                                                    | Validates all untrusted JSON at the boundary (settings file, GitHub release/manifest JSON). Schemas are the single source of truth — the TS types are derived via `z.infer`, never declared twice. See note below.                                            |
| Filesystem           | Node `fs` / `fs/promises`, `path`                          | Built in; all package-folder operations.                                                                                                                                                                                                                      |
| Folder picker        | Electron `dialog.showOpenDialog`                           | Built in; native directory chooser.                                                                                                                                                                                                                           |
| Settings store       | JSON file in `app.getPath('userData')`, validated with zod | Built in; no `electron-store` strictly required.                                                                                                                                                                                                              |
| Tests                | **Vitest**                                                 | Pairs with Vite (shares config/transform), fast, Jest-compatible API; used for unit tests of parsers, providers, resolver, and flows.                                                                                                                         |
| Packaging            | **electron-builder** (dev-only dependency)                 | Produces a Windows installer / portable `.exe` to attach to the Findias Releases page.                                                                                                                                                                        |
| App self-update      | **electron-updater** (GitHub provider)                     | Lets a running Findias check the `tekashi-side/Findias` releases feed and prompt the user to update — no manual re-download. See [App self-update](#app-self-update).                                                                                         |

> "No dependencies" applies to the **end user**. The build machine still uses
> normal npm dev/runtime dependencies (Electron, Vite, React, Tailwind/shadcn, TanStack
> Query, electron-builder, electron-updater). These are compiled/bundled into the
> shipped artifact and are invisible to users.

### Why Vite

Vite is the standard, low-friction way to scaffold a TypeScript + React app and
gives a fast dev server with hot module replacement. For Electron specifically we
use **`electron-vite`**, a thin wrapper that builds all three entry points (main,
preload, renderer) from one Vite config and wires up HMR for the renderer during
development. Choosing Vite also makes **Vitest** the natural test runner since it
reuses the same transform pipeline and config.

### Theming

The renderer is styled with **Tailwind CSS v4** (CSS-first, no `tailwind.config.js`)
and **shadcn/ui** components built on Radix primitives. The design system is
generated from a single [shadcn/create](https://ui.shadcn.com/create) preset
(`b1Vn0UwC`): **Luma** style, **neutral** base color, **cyan** theme, **Lucide**
icons, **Noto Sans** font, default radius. The preset is the source of truth and
is decodable/reproducible via `npx shadcn@latest preset decode b1Vn0UwC`.

- All tokens live in [src/renderer/index.css](../src/renderer/index.css): the
  `@theme inline` mapping plus the `:root` (light) and `.dark` token blocks. The
  app supports **system / light / dark** modes via
  [`components/theme-provider.tsx`](../src/renderer/components/theme-provider.tsx)
  (persists the choice in `localStorage`, toggles the `<html>` class); the user
  picks it from the Appearance item in Settings.
- The Luma component geometry/spacing comes from `@import "shadcn/tailwind.css"`,
  and **Noto Sans is self-hosted** via `@fontsource-variable/noto-sans` (bundled
  woff2, so it works offline and within the renderer's strict CSP — no Google
  Fonts request).
- shadcn primitives are **vendored** under `components/ui/` and edited in-repo
  (e.g. `sonner.tsx` reads our `ThemeProvider` instead of `next-themes`).
  Add more with `npx shadcn@latest add <component>`; re-theme later with
  `npx shadcn@latest apply <preset>`. See [shadcn.md](./shadcn.md) for the full
  re-theme procedure and the list of local modifications to preserve.

> CLI/tooling note: the shadcn CLI only detects a root `vite.config.*`, but the
> app builds via `electron.vite.config.ts`. A tiny root `vite.config.ts` shim
> exists solely so the CLI can resolve Vite + Tailwind + the `@` alias; nothing
> (build, dev, or Vitest) actually uses it.

### `fetch` vs Electron `net`

We use `fetch`. Electron also ships a `net` module that routes through Chromium's
network stack; its main advantage is automatic **system-proxy / OS certificate**
support. `fetch` is the standard, portable API (works in Node and the renderer),
is easy to mock in Vitest, and is sufficient for unauthenticated GitHub GETs and
redirect-following downloads. The only realistic reason to revisit `net` later is
if users behind corporate proxies report connection failures.

### React Query over IPC (not over the network)

The renderer never makes network calls. **All networking happens in the main
process behind IPC.** TanStack Query is used purely as the renderer's async-state
layer: its `queryFn`/`mutationFn` call `window.findias.*` (which invoke IPC),
and in return we get loading/error states, request de-duplication, and clean
post-mutation invalidation/refetch. Conceptually:

```ts
// renderer
useQuery({ queryKey: ['modList'], queryFn: () => window.findias.refresh() });
useMutation({
  mutationFn: (modId: string) => window.findias.installOrUpdate(modId),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modList'] }),
});
```

Because every mutating IPC call already returns the fresh `ModListState`, React
Query can also seed the cache directly from the mutation result and skip a
re-fetch.

### Validation with zod

Every place Findias ingests **untrusted JSON** validates it with a zod schema
rather than trusting a TypeScript cast (`as`). This covers the local settings
file today, and will cover the GitHub release/manifest JSON in the catalog
provider. Rules:

- The **schema is the single source of truth**; the matching TypeScript type is
  derived with `z.infer`, so a shape is never declared in two places.
- Schemas live in a shared module and are imported wherever the type/validator
  is needed (main, preload, or renderer) — no duplicated definitions.
- Parsing uses `safeParse` and degrades gracefully: invalid/missing fields fall
  back to defaults (via per-field `.catch`), and wholly invalid input returns a
  safe default, so a corrupt file or unexpected API payload never crashes the app.

Example — the settings schema is the source for both validation and the type:

```ts
export const settingsSchema = z.object({
  gameRootPath: z.string().nullable().catch(null),
  includePrereleases: z.boolean().catch(true),
});
export type Settings = z.infer<typeof settingsSchema>;
```

The same lenient `safeParse` approach validates the copied `manifestCatalog.json`
schema — see [Schema sharing](#schema-sharing-copied-from-uiscias).

## Distribution model

```
tekashi-side/Findias (GitHub)        Root50199/Uiscias (GitHub)
        │ Releases                            │ Releases
        │  └─ Findias-Setup-x.y.z.exe         │  ├─ manifestCatalog.json  (the catalog)
        │                                     │  └─ Uiscias<Name>_<n>.it  (mod assets)
        ▼                                     ▼
   user downloads & runs            Findias reads the latest release's
   the Findias app  ───────────────► manifestCatalog.json, then downloads
                                      chosen mods directly into appdata\package
```

- Findias is built with electron-builder and published as a release asset on
  **`tekashi-side/Findias`**. Users get new Findias versions by downloading the
  latest release there.
- The mod `.it` files and the `manifestCatalog.json` live on
  **`Root50199/Uiscias`** releases. Findias never re-hosts them; the user
  downloads them straight from GitHub's CDN.
- Findias selects the **newest** eligible release. Whether **prereleases** count
  as eligible is a persisted user setting (`includePrereleases`), needed because
  the manifest currently ships only on prereleases.

## App self-update

electron-builder only builds and publishes. The auto-update capability comes from
its companion **`electron-updater`**, configured with the **GitHub provider**
pointed at `tekashi-side/Findias`.

Flow:

1. We publish a new Findias release (with the electron-updater metadata file,
   e.g. `latest.yml`, alongside the installer) to the Findias releases page.
2. On launch (and/or on an interval), the main process calls
   `autoUpdater.checkForUpdates()`, which reads that releases feed.
3. If a newer version exists, electron-updater downloads it in the background and
   emits events. The main process forwards an `update-available` /
   `update-downloaded` event over IPC, and the renderer shows a non-blocking
   "Update ready — restart to install" prompt.
4. On user confirmation, `autoUpdater.quitAndInstall()` swaps in the new version.

Notes and caveats:

- This is **app** self-update (the Findias program), distinct from **mod**
  updates (the `.it` files), which remain explicit, user-initiated actions.
- Windows target should be **NSIS** (electron-updater supports it). The portable
  target does not auto-update.
- Unsigned builds still update but trigger SmartScreen warnings on install.
  Code signing removes the warning but has a cost; it is **optional for now** and
  does not change the architecture.
- Update checks hit the GitHub releases feed for `tekashi-side/Findias` — a
  separate, infrequent request from the Uiscias mod-catalog fetch.

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
│  - Modules: SettingsStore, GameLocation, ModStore,                 │
│    ManifestCatalogProvider (ModCatalogProvider),                  │
│    PackageFolderProvider (InstalledModsProvider),                  │
│    ModResolver, ModInstaller, Downloader, Updater                  │
└────────────────────────────────────────────────────────────────────┘
```

Security posture (non-negotiable defaults): `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true` where feasible, and a preload that
exposes only a small, explicit API surface. The renderer can never read or write
arbitrary files; it can only ask the main process to perform named operations.

### Window

A single small, non-fullscreen `BrowserWindow` centered on screen
(`center: true`), non-maximized by default, with a sensible minimum size.

## Repository layout

The top-level `src/{main,preload,renderer,shared}` split mirrors the process
model above. The layout below is **fixed**: each module named in
[Module responsibilities](#module-responsibilities-main-process) has a
predetermined home, so building out later phases is a matter of dropping files
into place rather than reorganizing.

```
src/
├─ main/                     # Node main process — all fs / network / dialog
│  ├─ index.ts               # app lifecycle + window creation (bootstrap)
│  ├─ ipc.ts                 # ipcMain.handle registration; emits events
│  ├─ settingsStore.ts       # load/save + zod-validate settings   (+ .test.ts)
│  ├─ gameLocation.ts        # validate game folder; resolve package paths (+ .test.ts)
│  ├─ modStore.ts            # PackageModStore: physical .it disk ops (invariant)
│  ├─ modResolver.ts         # merge catalog + installed → ModListState
│  ├─ modInstaller.ts        # orchestrate install / update / delete / disable
│  ├─ downloader.ts          # stream → temp file → atomic rename + progress
│  ├─ updater.ts             # electron-updater wrapper (app self-update)
│  └─ providers/             # swappable source seams (the DI boundary)
│     ├─ catalog.ts              # ModCatalogProvider contract + Catalog/Group/Variant + CatalogError
│     ├─ manifestSchema.ts       # copied lenient zod schema for manifestCatalog.json
│     ├─ githubReleases.ts       # release fetch + newest-eligible selection helper
│     ├─ manifestCatalog.ts      # createManifestCatalogProvider (current impl)
│     ├─ installed.ts            # InstalledModsProvider contract + InstalledMod
│     └─ packageFolder.ts        # createPackageFolderProvider (current impl)
├─ preload/
│  ├─ index.ts               # contextBridge → window.findias
│  └─ index.d.ts             # ambient types for window.findias
├─ renderer/                 # Chromium UI (React); NO direct Node access
│  ├─ index.html             # Vite entry HTML (the renderer's Vite root)
│  ├─ main.tsx               # React bootstrap (QueryClient, global CSS)
│  ├─ index.css              # Tailwind v4 entry + theme tokens (@theme / :root / .dark)
│  ├─ env.d.ts               # vite/client types
│  ├─ App.tsx                # top-level view orchestration
│  ├─ components/            # app UI components
│  │  └─ ui/                 # shadcn/ui primitives (generated, editable in-repo)
│  ├─ lib/                   # cn() class-name helper (utils.ts)
│  └─ hooks/                 # (future) TanStack Query hooks over window.findias
└─ shared/                   # ONLY code that crosses the IPC boundary
   ├─ api.ts                 # FindiasApi contract, channel names, IPC DTOs
   ├─ modList.ts             # ModListState + ModGroupRow/ModVariantRow DTOs
   ├─ modFilename.ts         # filename grammar parser (installed scan) (+ .test.ts)
   └─ modFilename.test.ts
```

Conventions that keep the tree stable:

- **`main/` stays flat, with one subfolder: `providers/`.** That is the only
  place the design anticipates multiple, interchangeable implementations (see
  [Source abstraction](#source-abstraction-swappable-providers)). Every other
  main-process concern is a single-purpose module at the top of `main/`.
- **Inside `providers/`, the contract and each implementation are separate
  files.** The interface + its normalized types live in a `<domain>.ts`
  (`catalog.ts`, `installed.ts`); each concrete source is its own
  `<strategy>.ts` (`manifestCatalog.ts`, `packageFolder.ts`) that imports
  and implements the contract. **Adding a source is purely additive** — drop in
  e.g. `localManifest.ts` implementing `InstalledModsProvider` and switch which
  factory the startup wiring calls; no contract or consumer changes.
- **Tests co-locate** with their subject as `<module>.test.ts`.
- **`shared/` means "crosses IPC."** It holds the `FindiasApi` contract, channel
  names, and the serializable DTOs the renderer renders (e.g. `ModListState`).
  Provider interfaces and non-serializable types like `CatalogVariant` (whose
  `fetchBytes()` returns a stream) are **main-only** and stay in `main/` — they
  never reach the renderer, so they don't belong in `shared/`. Promote a type to
  `shared/` only when it actually needs to cross the boundary.
- **The renderer is not nested.** `src/renderer/` is itself the renderer's Vite
  root (it holds `index.html`), and React sources live directly inside it — there
  is no `src/renderer/src/`. The `@renderer` / `@shared` import aliases map to
  `src/renderer` and `src/shared`.

## IPC boundary

All renderer↔main communication goes through a single typed API exposed on
`window.findias`. Request/response calls use `ipcRenderer.invoke` /
`ipcMain.handle`; long-running progress uses main→renderer events.

```ts
// Shape exposed by the preload (illustrative, not final)
interface FindiasApi {
  // settings & setup
  getSetupState(): Promise<SetupState>; // { gameRootPath, valid, includePrereleases }
  chooseGameFolder(): Promise<ChooseFolderResult>;
  setIncludePrereleases(value: boolean): Promise<ModListState>; // persist + re-resolve

  // catalog
  refresh(): Promise<ModListState>; // scan disk + fetch manifest + resolve

  // mutations
  installOrUpdate(modId: string): Promise<ModListState>; // installs/updates; auto-switches variants
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

## Source abstraction (swappable providers)

Both "sources of truth" are accessed **only through interfaces**, never directly
by the rest of the app. The remote catalog now has a **single** implementation
(`ManifestCatalogProvider`), so the catalog keeps the manifest's **grouped** shape
end-to-end (no flatten/regroup); the interface remains mainly so tests can inject
a stubbed `fetch`. The local installed-state seam still anticipates a swap, with
no impact on `ModResolver`, `ModInstaller`, the IPC layer, or the UI.

Anticipated future strategies the design must not preclude:

- **Local installed-state:** instead of scanning the folder, read a richer
  `installedMods.json` / `manifest.json` in the `package` directory that also
  records metadata like install/update timestamps. (Contract not finalized.)

### The interfaces

The remote catalog mirrors `manifestCatalog.json` 1:1 — `{ metadata, groups }`,
where every group has one or more variants. A non-variant mod is simply a group
of one. See [Schema sharing](#schema-sharing-copied-from-uiscias) for how the
manifest is validated.

```ts
// Remote: "what mods exist (grouped, with variants), and how to obtain the bytes"
interface ModCatalogProvider {
  getCatalog(includePrereleases: boolean): Promise<Catalog>;
}

interface Catalog {
  metadata: CatalogMetadata; // game versions, schemaVersion, generatedAt
  groups: CatalogGroup[];
}

interface CatalogGroup {
  groupId: string;
  modName: string; // group display name
  findiasTags: string[];
  hasVariants: boolean;
  mutuallyExclusive: boolean;
  variants: CatalogVariant[]; // length 1 for a non-variant mod
}

interface CatalogVariant {
  modId: string; // <ModFileName>, the install identity
  modName: string; // human display name
  fileName: string; // target file name in package/
  version: number;
  size: number;
  updateType: string; // stable | volatile (freshness class)
  usedFiles: string[]; // files this mod modifies → conflict detection
  // The provider returns a way to fetch bytes without leaking source details:
  fetchBytes(): Promise<ReadableStream>; // resolved from the release's .it asset URL
}

// Local: "what is installed, and how we record changes to that record"
interface InstalledModsProvider {
  list(): Promise<InstalledMod[]>; // normalized installed state
  // Lifecycle hooks so swapping the strategy doesn't change ModInstaller:
  onInstalled?(mod: InstalledMod): Promise<void>;
  onRemoved?(modId: string): Promise<void>;
}

interface InstalledMod {
  modId: string;
  version: number;
  fileName: string;
  enabled: boolean; // false = in package/disabled
  updatedAt?: string; // available only if the source records it
}
```

The rest of the system depends on these **normalized types** (`Catalog`,
`InstalledMod`) — never on GitHub-specific or filesystem-specific shapes.

### Separation of physical store vs. installed-state record

There is one invariant that no strategy can change: **the game loads `.it` files
from the root of `package`**, so the physical files must always be written,
deleted, and moved there. We therefore separate two concerns:

- **`ModStore` (physical, invariant):** performs the actual disk operations —
  write a downloaded `.it` into `package`, delete it, move it to/from
  `package/disabled`. This never changes regardless of how we _track_ state.
- **`InstalledModsProvider` (swappable record):** answers "what is installed"
  and records changes. Today it simply **derives** the answer by scanning the
  folder (the folder _is_ the record), so `onInstalled`/`onRemoved` are no-ops.
  A future `installedMods.json` implementation would persist richer metadata in
  those hooks — and because `ModInstaller` only calls the interface, swapping the
  implementation requires no change to the installer or anything downstream.

### Current implementations

| Interface               | Current implementation    | Reads/writes                                                         | Possible future implementation                 |
| ----------------------- | ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `ModCatalogProvider`    | `ManifestCatalogProvider` | `GET /releases` → newest eligible → its `manifestCatalog.json` asset | `SourceTreeCatalogProvider` (latest `main`)    |
| `InstalledModsProvider` | `PackageFolderProvider`   | scans `package` + `package/disabled`                                 | `LocalManifestProvider` (`installedMods.json`) |
| `ModStore` (invariant)  | `PackageModStore`         | writes/deletes/moves `.it` in `package`                              | — (does not change)                            |

The GitHub release-fetch + newest-eligible-selection logic is factored into a
small `providers/githubReleases.ts` helper (rate-limit, network, HTTP, and
prerelease-filter handling) reused by `ManifestCatalogProvider`.

Swapping a source = constructing a different provider at startup and passing it
in (dependency injection). The detail of _which_ provider is in use is confined
to that one module.

**File organization.** Each interface and its implementations are scoped to
separate files under `src/main/providers/`: the contract (interface + normalized
types) lives in `catalog.ts` / `installed.ts`, and every concrete source is its
own sibling file — `manifestCatalog.ts`, `packageFolder.ts` today, plus the
copied `manifestSchema.ts` and the `githubReleases.ts` fetch helper, and e.g.
`localManifest.ts` later. Adding a source is therefore **additive** (a new file
implementing the existing contract); switching sources is a one-line change at
the startup wiring. See [Repository layout](#repository-layout).

### Schema sharing (copied from Uiscias)

The `manifestCatalog.json` shape is owned by Uiscias. Per project decision the
**zod schema is copied** into both repos (a shared `@uiscias/schema` package is a
later option). Findias's copy lives in `providers/manifestSchema.ts` and is
deliberately **lenient** so an older Findias can read a newer manifest:

- `findiasTags` is `string[]` (not a closed enum), so new upstream tags render
  instead of failing validation.
- `updateType` falls back to `volatile` for unknown values.
- `metadata` passes through unknown top-level fields.
- A `MANIFEST_SCHEMA_VERSION` constant guards against a breaking format bump: a
  manifest whose `metadata.schemaVersion` exceeds it is rejected with a clear
  "update Findias" message.

## External integration: GitHub (current `ModCatalogProvider`)

> This section describes `ManifestCatalogProvider`, the **current** implementation
> of [`ModCatalogProvider`](#the-interfaces). If the remote contract later changes
> to a source-tree strategy, only this module changes; it must keep returning a
> normalized `Catalog`.

### Reading the available mods (release client)

- **Endpoint:** `GET https://api.github.com/repos/Root50199/Uiscias/releases`
- **Selection:** take the newest **non-draft** entry. Whether prereleases are
  eligible depends on the persisted `includePrereleases` setting; we use the
  _list_ endpoint (not `/releases/latest`, which always excludes prereleases) so
  prerelease-flagged builds can be surfaced when the user opts in. This selection
  logic lives in `providers/githubReleases.ts`.
- **Auth:** none. Public repo, unauthenticated request.
- **The catalog asset:** the provider finds the release's `manifestCatalog.json`
  asset, downloads it, and validates it with the copied lenient schema. It also
  builds a `fileName → browser_download_url` map from the release's `.it` assets
  so each variant's `fetchBytes()` can resolve its download URL. A release with no
  manifest asset surfaces a clear "not published yet" `CatalogError`.

Example of the manifest shape we depend on:

```json
{
  "metadata": {
    "schemaVersion": 1,
    "currentGameVersion": "1.2.4",
    "supportedGameVersion": "1.2.3",
    "generatedAt": "2026-06-27T10:14:25.451Z"
  },
  "modList": [
    {
      "groupId": "BriHpBars",
      "modName": "Bri Hp Bars",
      "findiasTags": ["Combat", "UI"],
      "hasVariants": true,
      "mutuallyExclusive": true,
      "variants": [
        {
          "modId": "BriHpBars1And2",
          "modName": "Bri Hp Bars 1 And 2",
          "fileName": "UisciasBriHpBars1And2_00003.it",
          "version": 3,
          "size": 1106734,
          "updateType": "volatile",
          "usedFiles": ["data/db/Race.xml"],
          "modAuthor": "Root50199",
          "modAdditionalCredits": "None",
          "recentUpdateNotes": "n/a"
        }
      ]
    }
  ]
}
```

### Rate limits

Unauthenticated GitHub API requests are limited to **60 per hour per IP**
(confirmed via `X-RateLimit-Limit: 60`). Findias makes **one** release API request
per launch; the manifest and mod downloads hit the CDN (`browser_download_url`),
not the API. This is comfortably within budget. The client should still:

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

### Scanning installed mods (current `InstalledModsProvider`)

This is `PackageFolderProvider`, the **current** implementation of
[`InstalledModsProvider`](#the-interfaces). It derives installed state purely
from the filesystem; if we later adopt an `installedMods.json`, only this module
is replaced (see [Source abstraction](#source-abstraction-swappable-providers)).

- `fs.readdir(<gameRoot>/package)` reads the **root only** (the game ignores
  subfolders; see game-structure). The `package/disabled` subfolder is read
  separately to detect **disabled** mods.
- Each entry is filtered to `.it` and run through the shared filename parser.
  Files that don't match the managed grammar are **left untouched and ignored**
  (official `data_XXXXX.it` and third-party mods are never modified).
- The directory is the record: the scan result _is_ the installed-state, returned
  as normalized `InstalledMod[]`. Nothing is cached to disk, and the
  `onInstalled`/`onRemoved` hooks are no-ops in this implementation.

### The `package/disabled` folder

- Disabled mods live in a single fixed subfolder: **`package/disabled`**.
- It is **created lazily** — only when a mod is first disabled and the folder
  does not already exist (`fs.mkdir(..., { recursive: true })`).
- Findias **never deletes the `disabled` folder** once it exists. Disable/enable
  only move individual `.it` files in and out of it; the folder itself persists
  even when empty.

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

The parser is used by the **package scanner** to derive installed `modId` +
`version` from on-disk files. The catalog no longer parses asset names — `modId`,
`version`, and `fileName` come straight from the manifest — so the parser's job is
now strictly to interpret what is **installed** (and to match it back to the
catalog by `modId`).

```ts
// Single source of truth for the grammar (illustrative)
const MANAGED = /^Uiscias(?<name>[^_]+)_(?<version>\d{1,5})\.it$/;

interface ParsedMod {
  fileName: string; // exact file name on disk / asset name
  modId: string; // <ModFileName>
  version: number; // parsed integer
}
```

> **Upstream dependency.** The canonical naming convention is owned upstream: the
> Uiscias maintainer publishes `Uiscias<ModFileName>_<number>.it` assets and the
> matching `manifestCatalog.json`. Findias's parser is **strict** about what
> qualifies as a managed installed file but **tolerant** of non-conforming files
> (it skips them rather than erroring).

### Non-conforming / stray files

Files in `package` that don't match the managed grammar (official
`data_XXXXX.it`, third-party mods) are **skipped** silently — never scanned as
managed, never modified. If the catalog itself is unavailable (offline,
rate-limited, no manifest yet), the resolver still returns installed mods as
orphans so the user can manage them, and the UI shows a clear banner.

## Mod resolution (joining the two sources)

The `ModResolver` merges the grouped catalog and the disk scan into the grouped
list the UI renders: `resolveModList(catalog, installed) → { groups, metadata }`.
It iterates the catalog **groups**, building a `ModVariantRow` per variant (keyed
by `modId`) and a `ModGroupRow` per group; installed mods absent from the catalog
become single-variant **orphan** groups.

**Per-variant status** is strictly **version-number based** (catalog game-version
metadata never influences it):

| Catalog has it | Installed (enabled) | Installed (disabled) | Status                                                   |
| -------------- | ------------------- | -------------------- | -------------------------------------------------------- |
| ✓              | —                   | —                    | **Not installed** → _Install_                            |
| ✓              | ≥ catalog version   | —                    | **Up to date** → _Disable_ + _Delete_                    |
| ✓              | < catalog version   | —                    | **Update available** → _Update_ + _Disable_ + _Delete_   |
| ✓              | —                   | any                  | **Disabled** → _Enable_ (+ _Update_ if stale) + _Delete_ |
| —              | any                 | any                  | **Orphan** (installed, not in catalog) → _Delete_ only   |

**Conflict detection (enabled-only).** Because the game loads only the `package`
root, only **enabled** mods can truly conflict. The resolver builds a
`usedFile → enabled-mod` index from enabled, catalog-known installs. For each
variant it collects the enabled mods sharing any `usedFiles`, **excluding
same-group siblings** (a mutually-exclusive switch handles those). When that set
is non-empty, every action that would **enable** the variant
(`install`/`update`/`enable`) is dropped and the conflicting mods are listed in
`conflicts` (by `modName`) for the UI. Concretely, a conflicting **disabled**
variant collapses to **Delete-only**, and a conflicting **not-installed** variant
loses its Install. Two conflicting mods may both be installed; they can never both
be enabled. Deleting/disabling the enabled blocker restores the actions on the
next resolve.

**Freshness signals (two, never mixed).** The resolver sets a single
banner-only flag, `metadata.outdated = supportedGameVersion !== currentGameVersion`.
It drives **only** the top-of-app banner and the conditional display of each
variant's `updateType` (`stable`/`volatile`); it is never read into any variant's
`status`. A variant's `update-available` remains strictly version-number based.

The resulting `ModListState` is `{ groups, catalog, metadata }`. Each
`ModGroupRow` carries `groupId`, group `name`, `tags`, `hasVariants`,
`mutuallyExclusive`, `installedVariantId`, and its `variants`; each
`ModVariantRow` carries display name, versions, size, `fileName`, `updateType`,
`tags`, `status`, `actions`, and `conflicts`.

## Core flows

### Launch / refresh

```
app ready
  → load settings
  → valid game path? ──no──► show setup gate (chooseGameFolder)
        │ yes
        ▼
  InstalledModsProvider.list()                       ┐ (folder scan)
  ModCatalogProvider.getCatalog(includePrereleases)  ┘ (manifest of newest release)
  → resolveModList(catalog, installed) → { groups, metadata }
  → ModListState { groups, catalog, metadata }
  → renderer renders grouped list + freshness banner (or empty/error state)
  → (separately) Updater.checkForUpdates() for the Findias app itself
```

> A catalog fetch failure degrades softly: installed mods are still returned (as
> orphans), `catalog.available` is false with a message, and `metadata` is null.

### Install / variant auto-switch

```
installOrUpdate(modId)
  → getCatalog → find { group, variant } for modId
  → if group.mutuallyExclusive: replaceSiblings = other variants' modIds
  → Downloader: stream variant.fetchBytes() → package/<tempfile>
     (emit onDownloadProgress, totalBytes = variant.size)
  → ModStore: atomic rename → package/Uiscias<modId>_<n>.it
  → ModStore.removeManaged(modId, keep new file)   (replace old version)
  → ModStore.removeManaged(siblingModId) for each replaceSibling  (variant switch)
  → re-list + re-resolve (same catalog) → return ModListState
```

Choosing a different variant is therefore a single action: install the chosen one,
then remove the previously-installed sibling. The enabled-only conflict rule means
the resolver already prevents enabling a mod that would clash with an unrelated
enabled mod, so no separate guard is needed here.

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
  → ensure package/disabled exists (create lazily if missing)
  → fs.rename package/Uiscias<modId>_<n>.it
            → package/disabled/Uiscias<modId>_<n>.it
setDisabled(modId, false) → reverse the move (root ← package/disabled)
```

The game only loads `.it` files in the **root** of `package`, so moving a file
into the `package/disabled` subfolder disables it without deleting it (see
game-structure). The `disabled` folder is created on first use and never removed
by Findias.

## Application state

```ts
interface Settings {
  gameRootPath: string | null; // the appdata folder
  includePrereleases: boolean; // whether prereleases are eligible (default true)
  // future: UI prefs, last-used filters, etc.
}

interface AppState {
  settings: Settings; // persisted to userData JSON
  catalog: Catalog | null; // in-memory only, this launch (manifest groups + metadata)
  installed: ParsedMod[]; // in-memory only, from disk scan
  modList: ModListState; // derived, sent to renderer
  busy: Record<string, ActionStatus>; // per-mod in-flight action + progress
}
```

- **Persisted:** only `Settings` (a small JSON file under
  `app.getPath('userData')`). No mod catalog is ever written to disk.
- **Ephemeral:** `release`, `installed`, and the derived `modList` exist only
  while the app is open and are rebuilt from the two sources on every refresh.

## Error handling and edge cases

- **No/invalid game path** → setup gate blocks all mod operations.
- **Offline / GitHub unreachable / rate-limited (403) / no manifest yet** →
  refresh fails softly with a retry affordance; any already-installed mods (from
  the disk scan) are still shown as orphans and can be managed even without the
  catalog.
- **Partial download / cancel / crash** → temp-file + atomic rename guarantees no
  half-written `.it` in `package`.
- **Duplicate versions found on disk** (e.g. from a crashed update or manual user
  action) → the resolver flags the mod and the next install/update reconciles to
  a single newest file.
- **Non-conforming or unowned files** in `package` → ignored, never modified.
- **Disk write failure / permissions** (e.g. game installed under a protected
  path) → surfaced to the UI with the OS error; no silent failure.

## Module responsibilities (main process)

| Module                    | Implements              | Responsibility                                                                                                                                                                    |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsStore`           | —                       | Load/save the JSON settings file in `userData`.                                                                                                                                   |
| `GameLocation`            | —                       | Validate a chosen folder; resolve `package` and `package/disabled` paths.                                                                                                         |
| `ManifestCatalogProvider` | `ModCatalogProvider`    | Select newest eligible release (via `githubReleases.ts`), download + leniently validate its `manifestCatalog.json`, return normalized grouped `Catalog`. Swappable (source-tree). |
| `PackageFolderProvider`   | `InstalledModsProvider` | List/parse managed `.it` files (root + `package/disabled`); return `InstalledMod[]`. Swappable (`installedMods.json`).                                                            |
| `ModStore`                | — (invariant)           | Physical disk ops: write/delete/move `.it` files in `package` and `package/disabled`.                                                                                             |
| `ModResolver`             | —                       | Merge grouped catalog + installed into `ModListState` (group/variant rows, status, actions, enabled-only conflicts, banner freshness). Depends only on the normalized interfaces. |
| `Downloader`              | —                       | Stream a source's bytes to a temp file with progress + atomic rename.                                                                                                             |
| `ModInstaller`            | —                       | Orchestrate install / update(replace) / delete / disable via the providers + `ModStore`.                                                                                          |
| `Updater`                 | —                       | electron-updater wrapper: check the Findias releases feed, surface update events over IPC.                                                                                        |
| `ipc`                     | —                       | Register `ipcMain.handle` endpoints; emit progress + update events; return fresh state.                                                                                           |

## Out of scope (technical)

- No automatic, unattended **mod** updating. Mod install/update/delete stay
  explicit, user-initiated actions. (The **app** does self-update via
  electron-updater — see [App self-update](#app-self-update).)
- No telemetry or analytics.
- No packing/repacking of raw mod content (handled upstream in Uiscias).
- No management of non-`Uiscias` `.it` files.
- No authenticated GitHub access or tokens (unauthenticated is sufficient).
