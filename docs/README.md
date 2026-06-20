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
- Any extra `.it` files dropped here (e.g. `uotiara_00001.it`) are **also**
  loaded. This is the mechanism that allows users to add their own mods.

```
appdata\package
```

#### `.it` file naming format

Files in `package` must follow this naming convention:

```
somename_X.it
```

- `somename` — a descriptive name.
- `X` — a number.

Notes:

- The game ships its own files using the `data_XXXXX.it` pattern.
- Mod files can use essentially any descriptive name, as long as they follow the
  `somename_X.it` format (e.g. `uotiara_00001.it`).

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
   `somename_X.it` naming format.
4. On the next game launch, the game loads every `.it` file in `package`,
   including the new mod file.

## Reference Layout

```
appdata\
├── data\              # User-created; raw mod files (not shipped)
├── package\           # Shipped; all .it files loaded on launch
│   ├── data_XXXXX.it  # Official game content (sequential patch numbers)
│   └── somename_X.it  # User mod files (e.g. uotiara_00001.it)
└── UOTiaraPack.bat    # Packages data\ into a single .it in package\
```
