# Findias Roadmap

This is the build sequence for Findias. It turns the design in
[`architecture.md`](./architecture.md) and the scope in
[`project-overview.md`](./project-overview.md) into ordered, shippable slices.

Each phase is a **vertical slice**: it touches main/preload/renderer as needed
and leaves the app in a runnable, demonstrable state. Phases are ordered by
dependency — later phases build on earlier ones.

> Status legend: ✅ done · 🔜 next · ⬜ planned

## Phase 0 — Scaffold & walking skeleton ✅

Validate the whole toolchain end to end before building features.

- electron-vite (`react-ts`) with TypeScript across main/preload/renderer.
- React + MUI + TanStack Query in the renderer; Vitest for tests.
- electron-builder + electron-updater installed and configured.
- Centered, non-fullscreen window with strict security defaults
  (`contextIsolation`, `sandbox`, no `nodeIntegration`).
- One typed IPC round-trip (`getAppInfo`) proving main ↔ preload ↔ renderer.
- Shared `modFilename` parser + unit tests as the first real module.
- `.node-version` pinned to `24.17.0`.

**Done when:** `npm run dev`, `npm run build`, `npm test`, and `npm run typecheck`
all succeed. ✅

## Phase 1 — Setup gate (choose game folder) ✅

The app cannot operate without a valid game folder, so this gates everything.

- `SettingsStore` — load/save JSON settings in `app.getPath('userData')`.
- `GameLocation` — validate a chosen folder (must contain `package`), resolve
  `package` and `package/disabled` paths.
- IPC: `getSettings`, `chooseGameFolder` (native `dialog.showOpenDialog`).
- Renderer: a **setup gate** screen shown when no valid path is stored; persists
  the choice and transitions into the (empty) main view.

**Done when:** first launch prompts for the folder, validates it, persists it,
and subsequent launches skip the prompt. Invalid folders are rejected with a
clear message. Unit tests cover `GameLocation` validation.

## Phase 2 — Read both sources ✅

Stand up the two swappable providers behind their interfaces.

- `InstalledModsProvider` (contract: `src/main/providers/installed.ts`) →
  `PackageFolderProvider` (`src/main/providers/packageFolder.ts`): scans
  `package` + `package/disabled`, parses via the shared grammar, returns
  `InstalledMod[]`; ignores official/third-party/stray files. ✅
- `ModCatalogProvider` (contract: `src/main/providers/catalog.ts`) →
  originally `GitHubReleaseCatalogProvider` (asset-name scraping), **superseded in
  Phase 7** by `ManifestCatalogProvider` (reads `manifestCatalog.json`). Both map
  offline/403/HTTP/parse failures to a typed `CatalogError`. ✅
- Both depend only on normalized types so they can later be swapped for
  source-tree or `installedMods.json` strategies. ✅

**Done when:** on launch the app fetches the catalog and scans the folder, with
unit tests for both providers (mock fetch + a temp fixture folder). ✅

> The temporary launch probe was removed in Phase 3 and replaced by the resolver
>
> - `refresh` IPC that feeds the renderer.

## Phase 3 — Resolve & render the mod list ✅

- `ModResolver` (`src/main/modResolver.ts`): merges catalog + installed by
  `modId` into rows with status (not installed / up to date / update available /
  disabled / orphan) and the valid actions per row. Pure and unit-tested. ✅
- DTOs (`src/shared/modList.ts`): `ModListState` / `ModRow` / `ModStatus` /
  `ModAction` cross the IPC boundary. ✅
- IPC: `refresh` scans the folder, fetches the catalog, and resolves; a catalog
  failure degrades softly (installed mods still returned as orphans, surfaced via
  `catalog.available`). ✅
- Renderer: scrollable MUI list — name, status chip, release + installed
  version, action buttons (rendered but disabled until Phase 4); loading / error
  (with retry) / catalog-unavailable banner / empty ("no compatible mods")
  states. ✅

**Done when:** the list renders real data from a live release against a real
`package` folder, with correct per-row status. Resolver has thorough unit tests. ✅

> Action buttons are intentionally **disabled** in Phase 3 — they reflect each
> row's valid actions but are wired to mutations in Phase 4.

## Phase 4 — Install / update / delete ✅

The core mutations, all written to operate via the providers + `ModStore`.

- `Downloader` (`src/main/downloader.ts`): streams `fetchBytes()` to a dotted
  temp file with cumulative progress, atomically renames into place, and removes
  the temp file on failure/cancel. ✅
- `ModStore` (`src/main/modStore.ts`): `PackageModStore.removeManaged(modId,
except?)` deletes managed files from the package root + disabled, optionally
  keeping one (replace). ✅
- `ModInstaller` (`src/main/modInstaller.ts`): **install/update** with
  write-new-then-delete-old replace semantics; **delete** is `removeManaged`. ✅
- IPC: `installOrUpdate` (one catalog fetch reused for lookup + post-resolve) and
  `deleteMod` return fresh `ModListState`; `onDownloadProgress` streams progress
  events. Row buttons (install/update/delete) are wired in the UI with a
  per-row progress bar. ✅

**Done when:** a user can install, update (old version removed), and delete a mod
end to end, with progress shown and no half-written files on failure. ✅

> Enable/disable buttons remain disabled until Phase 5.

## Phase 5 — Disable / enable ✅

- `ModStore.setDisabled` (`src/main/modStore.ts`): moves a mod's file(s) between
  `package` and the lazily-created, never-deleted `package/disabled` folder. ✅
- IPC `setDisabled` returns fresh `ModListState`; the resolver already reflects
  disabled state and now also offers a _Disable_ action on enabled in-release
  rows. UI enable/disable controls are wired via a toggle mutation. ✅

**Done when:** mods can be toggled disabled/enabled without deletion, and the
game-relevant root of `package` reflects the change. ✅

## Phase 6 — App self-update & release pipeline ⬜

- `Updater`: electron-updater (GitHub provider → `tekashi-side/Findias`); check
  on launch, surface `update-available` / `update-downloaded` over IPC; UI
  "restart to install" prompt.
- electron-builder NSIS target; document the publish flow (and the unsigned
  SmartScreen caveat).

**Done when:** publishing a new GitHub release causes a running app to detect,
download, and offer to install the update; a Windows installer is produced.

## Phase 7 — manifestCatalog.json integration ✅

Consume Uiscias's `manifestCatalog.json` instead of scraping release asset names.
This **evolves Phases 2–3** (the catalog provider, the DTOs, and the resolver/UI).

- **Schema (copied, lenient):** `providers/manifestSchema.ts` ports the Uiscias
  zod schema — `findiasTags` as `string[]`, `updateType` with a `volatile`
  fallback, passthrough `metadata`, and a `MANIFEST_SCHEMA_VERSION` guard. ✅
- **Grouped contract:** `catalog.ts` replaces flat `CatalogEntry` with
  `Catalog { metadata, groups }` / `CatalogGroup` / `CatalogVariant`, mirroring the
  manifest 1:1. A `githubReleases.ts` helper handles release fetch + newest-eligible
  selection (incl. the prerelease filter). ✅
- **Provider:** `ManifestCatalogProvider` downloads + validates the manifest asset
  and resolves each variant's `.it` URL from the release assets; the old provider
  is removed. ✅
- **DTOs + resolver:** `shared/modList.ts` gains `ModGroupRow`/`ModVariantRow`/
  `conflicts`/`CatalogMetadata`; the resolver builds grouped rows with enabled-only
  `usedFiles` conflict detection (sibling-aware) and a banner-only freshness flag. ✅
- **Installer/IPC:** variant auto-switch (`replaceSiblings`) and catalog metadata
  threaded through IPC. ✅
- **Renderer:** variant-group dropdown, tags/size/version display, a dedicated
  `updateType` indicator shown only while the freshness banner is active, conflict
  messaging, and the catalog-wide freshness banner. ✅
- **Prerelease toggle:** persisted `includePrereleases` setting + IPC + a UI switch
  that re-filters release selection (default on, since the manifest currently ships
  only on prereleases). ✅

**Done when:** the list renders from a live release's `manifestCatalog.json` with
variants grouped, conflicting installs prevented (naming the blocker), richer
metadata shown, the freshness banner working, and the prerelease toggle persisted.
Providers/resolver/installer have unit tests. ✅

## Cross-cutting (ongoing)

- **Tests:** pure modules (parser, providers, resolver) carry unit tests as they
  land; Vitest runs in CI-friendly form.
- **Error UX:** every IPC failure path surfaces a clear, recoverable UI state.
- **Security:** maintain the strict process boundary; the renderer never touches
  fs/network directly.

## Stretch (post-MVP)

- Rich mod details (screenshots/GIFs/descriptions from Uiscias media; the manifest
  already carries `modAuthor`, `modAdditionalCredits`, and `recentUpdateNotes`).
- Client-version awareness → **partially shipped** in Phase 7 as the catalog-wide
  freshness banner; detecting the **actual running client version** (rather than
  the manifest's `currentGameVersion`) and a per-mod verified-version signal remain.
- Source-of-truth swaps (a source-tree catalog, or a local `installedMods.json`
  with richer metadata) — already accommodated by the provider interfaces.
- A shared `@uiscias/schema` package to replace the copied manifest schema.
