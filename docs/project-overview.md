# Project Overview

This document outlines the goals, scope, and planned features of **Findias**, a
mod manager for Mabinogi. It is intended as reference context for both users and
the AI assisting in building this application. For details on the game's folder
structure and `.it` file naming rules, see [`game-structure.md`](./game-structure.md).

## Goal

Create **Findias**, a mod manager for the game Mabinogi that gives users an
easy-to-use **graphical user interface (GUI)** to **install**, **update**, and
**delete** mods for the game.

## Source of Truth for Mods

The mods themselves are stored and maintained in a GitHub repository called
**Uiscias**: <https://github.com/Root50199/Uiscias>.

- Findias treats this repository as the **source of truth** for which mods exist
  and what the latest versions are.
- Each GitHub **release** of Uiscias contains the prepacked `.it` files that are
  ready to drop into the game's `package` folder, **plus a `manifestCatalog.json`
  asset** that fully describes the catalog (per-mod metadata, variants, the files
  each mod modifies, tags, and catalog-wide game-version info).
- Findias reads that **manifest** from the **latest release** to determine what
  mods can currently be installed or updated — it no longer infers the catalog
  from release asset names.
- Because the manifest currently ships only on **prereleases**, Findias exposes a
  persisted **"Include prereleases"** toggle controlling whether prereleases are
  eligible when choosing the latest release.

> Note: All client modifications are against Nexon's Terms of Service and are
> used at the user's own risk. This tooling targets Mabinogi (North America).

## How It Fits Together

Findias mediates between two sources:

1. **Local game install** — specifically the `appdata\package` folder, which
   holds the installed mod `.it` files and reflects what is currently installed
   and at what version.
2. **Remote Uiscias release** — the latest GitHub release's `manifestCatalog.json`,
   which defines the available mods (grouped, with variants), their latest
   versions, the files each modifies, and catalog metadata.

By comparing the two, Findias can tell, for each mod, whether it is **not
installed**, **up to date**, or **out of date** (update available). The manifest
also lets Findias group **variants** of a mod and prevent **conflicting**
installs (see the conventions below).

## Findias Conventions

These are Findias-specific policies for identifying, versioning, and managing
mods. They build on the game's `.it` naming rules documented in
[`game-structure.md`](./game-structure.md).

### Managed mod naming

Findias uses the following format for all mods it installs and maintains:

```
Uiscias<ModFileName>_<number>.it
```

- The `Uiscias` prefix marks the file as installed/maintained by Findias, so we
  can reliably identify our own files in the `package` folder.
- `<ModFileName>` is the descriptive name of the mod (e.g. `SomeModFileName`).
- `<number>` represents the **version** of the mod and is incremented with each
  new release.

Versioning example:

- `UisciasSomeModFileName_00001.it` — version 1 of the `SomeModFileName` mod.
- `UisciasSomeModFileName_00002.it` — version 2 of the same mod.

Because the prefix begins with `U` (a letter after `d`) and contains no extra
underscores before the `_<number>` suffix, this convention satisfies the game's
naming rules.

### Only the latest version may be installed (critical)

Findias must ensure that **only the latest version** of any given mod exists in
the `package` folder at a time. There should **never** be both
`UisciasSomeModFileName_00001.it` and `UisciasSomeModFileName_00002.it` present
simultaneously.

The game client loads every `.it` file in the root of `package` and does not
pick a latest version — see
[`game-structure.md`](./game-structure.md#how-the-client-loads-it-files-critical)
for why duplicate versions cause conflicts.

Therefore, whenever Findias updates a mod, it must:

1. Write the new version file (e.g. `UisciasSomeModFileName_00002.it`).
2. **Delete the old version file** (e.g. `UisciasSomeModFileName_00001.it`).

In other words, updating a mod is a **replace** operation — exactly one file per
mod (identified by its `Uiscias<ModFileName>` portion) should ever be in
`package`.

### Mods with variants

Some mods ship as a set of mutually-exclusive **variants** (for example
`Bri Hp Bars` with `Bri Hp Bars 1 And 2` and `Bri Hp Bars 1 And 3`). The
manifest marks these with `hasVariants: true`. Findias renders such a mod as a
single top-level entry that has **no action buttons** and acts as a dropdown; the
individual variants inside carry the install/update/enable/delete actions. Only
**one variant may be installed at a time** (they modify the same files), so
choosing a different variant **auto-switches**: Findias installs the chosen one
and removes the previously-installed sibling in a single action.

### Conflicting mods (shared files)

Each mod lists the game files it modifies (`usedFiles` in the manifest). Two
mods that are **enabled at the same time** while modifying the same file would
conflict in-game, so Findias prevents it. Because the game only loads files in
the `package` root, the rule applies to **enabled** mods only:

- An action that would make a mod enabled (Install / Update / Enable) is
  **disabled** when an already-enabled mod modifies any of the same files, and
  Findias shows **which mod(s)** are responsible by name.
- A disabled mod that conflicts with an enabled one is therefore **delete-only**
  until the conflict is resolved.
- Two conflicting mods may both be installed (e.g. one enabled, one disabled);
  they can simply never both be enabled.

### Temporarily disabling mods

When disabling mods (e.g. after a game patch), Findias will **move** installed
mod files into a subfolder within `package` so the game does not load them on
launch. The game only loads `.it` files in the root of `package`, not in
subfolders — see [`game-structure.md`](./game-structure.md).

## MVP Feature List

1. **Local settings storage** — persist Findias settings locally (e.g. the chosen
   game install location and any user preferences).
2. **Choose install location** — prompt the user to select their Mabinogi
   install location (the root game folder, i.e. `appdata`) so Findias knows
   where to operate.
3. **Scan installed mods** — scan the `package` folder in the root game folder
   for all mod files that match the Findias naming convention
   (`Uiscias<ModFileName>_<number>.it`). This list acts as the local source of
   truth for which mods are currently installed and at what version.
4. **Check latest Uiscias release** — read the `manifestCatalog.json` asset from
   the latest Uiscias GitHub release to know which mods can currently be installed
   or updated, including their display names, tags, versions, sizes, variants, and
   the files each modifies. A persisted "Include prereleases" toggle controls
   release selection.
5. **Install / update / delete via GUI** — allow the user to:
   - **Install** a mod by downloading its `.it` file from the latest release.
   - **Update** a mod by downloading the latest file and deleting the old
     version (a replace operation — see
     [Only the latest version may be installed](#only-the-latest-version-may-be-installed-critical)).
   - **Delete** any installed Uiscias mod from the `package` folder.

## Stretch Feature List

1. **Rich mod details** — let the user select a mod in the GUI to view
   screenshots, GIFs, and/or videos along with descriptions and details
   explaining exactly what the mod does. (Uiscias stores example media, e.g. in
   its `ExampleImages` folder.)
2. **Client-version awareness** — a first cut now ships: the manifest's
   catalog-wide `supportedGameVersion` vs `currentGameVersion` drives a top-of-app
   banner suggesting users **temporarily disable** mods (especially `volatile`
   ones) after a game patch. Detecting the **actual running client version** and a
   finer-grained **per-mod** verified-version signal remain future work.

## Out of Scope (for now)

- Creating or editing mod content itself (packing/repacking raw files). Mod
  authoring is handled upstream in the Uiscias repository and its tooling.
- Managing non-Uiscias mods. Findias focuses on mods identified by the `Uiscias`
  prefix; other `.it` files in `package` are left untouched.
