# Catalog Enhancement Roadmap

A focused build sequence for three related enhancements to how Findias reconciles
the **installed `package` folder** against the **remote catalog**. It extends the
main [`roadmap.md`](./roadmap.md) (these slot in after Phase 7) and assumes the
design in [`architecture.md`](./architecture.md).

These three features are ordered by dependency and **should ship sequentially**,
each as its own vertical slice with tests. The ordering is deliberate: feature 1
makes the `orphan` category _trustworthy_, which is a prerequisite for shipping
features 2 and 3 safely.

> Status legend: ✅ done · 🔜 next · ⬜ planned

## Background: the problem

Today the resolver labels an installed mod an **orphan** purely because it is
absent from **the single catalog we currently fetched**:

- `src/main/modResolver.ts` — installed mods with no catalog variant become
  delete-only orphan groups (`buildOrphanGroup`).
- `src/main/providers/githubReleases.ts` — `fetchLatestReleaseAssets` selects
  exactly **one** release (newest eligible), gated by the persisted
  `includePrereleases` toggle.
- `src/main/ipc.ts` — `resolveCurrentState` fetches that one catalog per the
  current toggle and resolves against it.

So `orphan` conflates two unrelated things:

1. A genuinely unknown mod (manually dropped in, or removed upstream).
2. A perfectly valid mod that just isn't in the **channel currently being
   viewed** (e.g. a prerelease-only mod while the toggle is off).

Concretely: install mod **D** (prerelease-only) with the toggle on, switch it
off, and D becomes a (false) orphan even though nothing about D changed. This
also means a future "delete all orphans" action would be unsafe — it would eat
valid prerelease mods.

---

## Feature 1 — Superset catalog classification 🔜

**Goal:** stop false orphans on toggle, and surface when an installed version is
ahead of the stable channel — without persisting any catalog (keeps the "no
persisted mod catalog" design goal in [`architecture.md`](./architecture.md)).

### Approach

- From the **single** GitHub `/releases` response (already one API call), select
  **both** the newest stable release and the newest prerelease release. Fetch
  **both** `manifestCatalog.json` assets (two CDN downloads, no extra rate-limit
  cost — the CDN does not count against the API limit).
- **Classify** installed mods against the **union (superset)** of both catalogs.
  A mod found in either is recognized — never an orphan.
- **Offer / version** against the **selected** channel (per `includePrereleases`):
  install actions, "Not installed" availability, and the primary version shown
  follow the channel the user is viewing.
- A mod in **neither** catalog is a **true orphan** (delete-only) — this is the
  only thing that remains an orphan, which is exactly the clean bucket features 2
  and 3 depend on.

### Derived provenance (no persistence)

Because both catalogs are in hand at resolve time, the installed version can be
compared across them to derive a signal **without** an `installedMods.json`:

- Installed version **> selected channel's version** but **== other channel's
  version** → render an **"ahead of stable / prerelease version"** indicator
  instead of a misleading "Up to date".

Worked example — mod **F** (stable has v1, prerelease has v2), installed at v2,
toggle off (viewing stable):

- F is **not** an orphan (stable contains F at v1).
- The resolver's version comparison (`primary.version < variant.version` is
  false) yields **"Up to date" today**; with the superset data it becomes
  **"Ahead of stable (prerelease v2)"**.
- There is **no one-click downgrade**; to get stable's v1 the user must delete v2
  then install (replace semantics, one file per `modId`). This is acceptable and
  intentional.

**Limit:** version comparison cannot give _authoritative_ provenance when the two
channels share the same version number (and cannot render provenance fully
offline). That narrow case is the only reason to later adopt a richer
`installedMods.json` (already anticipated as `LocalManifestProvider` in
[`architecture.md`](./architecture.md)); it is **out of scope** here.

### Touch points

- `src/main/providers/githubReleases.ts` — select newest stable **and** newest
  prerelease in one pass.
- `src/main/providers/manifestCatalog.ts` / `catalog.ts` — expose fetching both
  catalogs (selected + superset).
- `src/main/modResolver.ts` — new signature, roughly
  `resolveModList(selectedCatalog, supersetCatalog, installed)`; recognize via the
  superset, version/offer via the selected, derive the "ahead of stable" status.
- `src/shared/modList.ts` — add the new status to `ModStatus` (e.g.
  `ahead-of-channel`), keeping `orphan` generic ("no catalog match anywhere").
- `src/renderer/components/StatusChip.tsx` — label/colour the new status.
- `src/main/ipc.ts` — thread both catalogs through `resolveCurrentState` /
  `installOrUpdate`.

### Forward-compat note

Keep the status model from assuming every installed mod has a catalog match or a
numeric version, so feature 2's unmanaged mods drop in cleanly. `orphan` should
stay "no catalog match anywhere"; do not bake "has a catalog entry" assumptions
into the new derived-status logic.

**Done when:** toggling prereleases no longer turns prerelease-only installed
mods into orphans; a mod installed ahead of the selected channel is shown as such
(not "Up to date" or "orphan"); a mod in neither catalog is still a delete-only
orphan. Resolver + provider changes are unit-tested (both-catalog fetch, union
classification, derived "ahead" status, true-orphan path).

---

## Feature 2 — Scanner + identity change (show third-party mods) ⬜

**Goal:** surface **third-party `.it` mods** (unpredictable names installed before
the user adopted Findias) in the list, distinct from official game files, so the
user can see and (via feature 3) manage them. Depends on feature 1 only insofar
as the `orphan`/unmanaged bucket is now meaningful and safe.

### The work (more than "list more files")

- **Scanner change** — today `src/main/providers/packageFolder.ts` keeps only
  files matching the managed grammar; `parseManagedModFileName`
  (`src/shared/modFilename.ts`) returns `null` for everything else, so
  third-party files are **not listed at all**. The scanner must also surface
  non-managed `.it` files.
- **Classification (the hard part)** — distinguish **official** game files
  (`data_XXXXX.it`, never shown or touched) from **third-party** mods. This is a
  heuristic rooted in [`game-structure.md`](./game-structure.md) (likely: any
  root `.it` that is neither `data_<digits>.it` nor managed = third-party).
- **Identity model** — `InstalledMod` (`src/main/providers/installed.ts`) assumes
  a parsed `modId` + numeric `version`; third-party files have neither. Introduce
  a filename-based identity path for unmanaged files (and the resolver groups by
  `modId`, so that path needs a non-`modId` key).
- **Status** — likely a distinct status from `orphan` (e.g. `unmanaged`) so the
  UI can message third-party mods differently from removed-upstream Uiscias mods.
- **Disk ops** — delete/disable route through `removeManaged` / `moveManaged`
  (`src/main/modStore.ts`), which match files via the `Uiscias…` grammar. Add a
  filename-based path so an unmanaged file can be moved/removed by feature 3.

**Done when:** third-party `.it` mods appear in the list as unmanaged/orphan,
official `data_XXXXX.it` files are never shown or touched, and the identity/disk
seams support acting on unmanaged files. Scanner + classification are
unit-tested with a fixture folder (managed + official + third-party + stray).

---

## Feature 3 — Bulk archive / delete orphans ⬜

**Goal:** let the user quickly disable/remove all orphaned/unmanaged mods in one
action. Safe **only because** feature 1 made `orphan` mean "in no catalog" — so a
sweep can no longer eat valid prerelease mods.

### Approach (to finalize at planning time)

- **Archive vs delete** — prefer **archive** (move to a dedicated folder so the
  action is reversible) as the default, with hard delete as an explicit option.
  Reuse the disable mechanism's safe same-volume `rename` semantics
  (`src/main/modStore.ts`) so the bulk move is instant and non-destructive.
- **Scope** — operates over the orphan/unmanaged set defined by features 1–2;
  never touches official game files or catalog-known mods.
- **IPC + UI** — a single bulk action returning fresh `ModListState`, with a
  confirmation summarizing exactly what will be moved/removed.

**Done when:** a user can archive (and optionally delete) all orphaned/unmanaged
mods in one confirmed action, valid catalog mods are never affected, and the
operation is reversible when archiving. Covered by tests over a mixed fixture.

---

## Why this order

1. **Feature 1 fixes a live correctness bug** (false orphans on toggle); 2 and 3
   are net-new capability that break nothing today.
2. **Feature 1 is the foundation** — 2 and 3 are only safe once `orphan` means
   "in no catalog". Building them on today's single-catalog logic risks
   bulk-deleting valid prerelease mods.
3. **Smaller, reviewable slices** — feature 2 introduces an identity/model change
   and a classification heuristic that are independent of the prerelease work;
   bundling would balloon the diff and mix a correctness fix with a model change.
