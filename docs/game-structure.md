# Mabinogi Game Structure

This document summarizes how the Mabinogi game's folder structure works, with a
focus on the directories and files relevant to modding. It is intended as
reference context for both users and the AI assisting in building this mod
manager.

## Root Game Folder (`appdata`)

The game's install location can vary, but the root game folder is **always**
named `appdata`.

```
<install path>\Nexon\Library\mabinogi\appdata
```

Example:

```
D:\Nexon\Library\mabinogi\appdata
```

Everything the mod manager cares about lives inside this `appdata` folder.

## Key Locations

### `appdata\data` — The mod source folder

- **Not shipped** with the public release of the game.
- Created manually by users who intend to mod the client.
- Holds the raw/unpackaged mod files that a user wants to add to the game.
- Serves as the input for the packaging process (see `UOTiaraPack.bat` below).

```
appdata\data
```

### `appdata\package` — The loaded content folder

- **Ships** with the public release of the game.
- Updated with new `data_XXXXX.it` files on each patch, where `XXXXX` is a
  number that is usually incremented sequentially with each update.
- On launch, the game loads **all** `.it` files in this folder into memory.
- Any extra `.it` files dropped here (e.g. `uisciasSomeModFileName_00001.it`)
  are **also** loaded. This is the mechanism that allows users to add their own
  mods.

```
appdata\package
```

#### `.it` file naming format

Files in `package` must follow this exact naming convention:

```
<name>_<number>.it
```

Rules:

- `<name>` must be a **single name part** — no extra underscores.
- `<name>` must **start with a letter after `d`** (e.g. `e`, `f`, `g`, ... `z`).
  Names starting with `a`–`d` are not allowed, so that mod files never collide
  with the game's official `data_XXXXX.it` files.
- `<number>` is **1 to 5 digits** (`0` to `99999`).

Examples:

- Valid: `eapple_01.it`, `zoom_711.it`, `uppercut_0.it`
- Invalid: `apple_01.it` (starts with `a`), `dapple_01.it` (starts with `d`),
  `e_chick_01.it` (extra underscore in the name part).

Notes:

- The game ships its own files using the `data_XXXXX.it` pattern.

#### Mod manager naming convention

This mod manager will use the following format for all mods it installs and
maintains:

```
uiscias<ModFileName>_<number>.it
```

- The `uiscias` prefix marks the file as installed/maintained by this mod
  manager, so we can reliably identify our own files in the `package` folder.
- `<ModFileName>` is the descriptive name of the mod (e.g. `SomeModFileName`).
- `<number>` represents the **version** of the mod and is incremented with each
  new release.

Versioning example:

- `uisciasSomeModFileName_00001.it` — version 1 of the `SomeModFileName` mod.
- `uisciasSomeModFileName_00002.it` — version 2 of the same mod.

Because the prefix begins with `u` (a letter after `d`) and contains no extra
underscores before the `_<number>` suffix, this convention satisfies all of the
naming rules above.

#### Only the latest version may exist in `package` (critical)

The mod manager must ensure that **only the latest version** of any given mod
exists in the `package` folder at a time. There should **never** be both
`uisciasSomeModFileName_00001.it` and `uisciasSomeModFileName_00002.it` present
simultaneously.

This is critical because the game client is **not** smart enough to pick the
latest version. On launch it simply loads **every** `.it` file in `package` into
memory. If multiple versions of the same mod are present, it will load **all**
of them, which causes conflicts and bugs.

Therefore, whenever the mod manager updates a mod, it must:

1. Write the new version file (e.g. `uisciasSomeModFileName_00002.it`).
2. **Delete the old version file** (e.g. `uisciasSomeModFileName_00001.it`).

In other words, updating a mod is a **replace** operation — exactly one file per
mod (identified by its `uiscias<ModFileName>` portion) should ever be in
`package`.

### `appdata\UOTiaraPack.bat` — The packaging tool

- A `.bat` script located directly in `appdata`.
- Scans all files within the `appdata\data` folder.
- Packages them into a single `.it` file.
- Places the resulting `.it` file into the `appdata\package` folder so the game
  will load it on launch.

```
appdata\UOTiaraPack.bat
```

## Modding Flow Summary

1. A user creates the `appdata\data` folder (if it doesn't already exist) and
   places their raw mod files inside it.
2. Running `appdata\UOTiaraPack.bat` packages the contents of `data` into a
   single `.it` file.
3. That `.it` file is written to `appdata\package` using the
   `<name>_<number>.it` naming format.
4. On the next game launch, the game loads every `.it` file in `package`,
   including the new mod file.

## Reference Layout

```
appdata\
├── data\              # User-created; raw mod files (not shipped)
├── package\           # Shipped; all .it files loaded on launch
│   ├── data_XXXXX.it             # Official game content (sequential patch numbers)
│   └── uisciasModName_00001.it   # Mod manager files (uiscias prefix + version)
└── UOTiaraPack.bat    # Packages data\ into a single .it in package\
```
