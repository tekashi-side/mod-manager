# Settings Storage

Where Findias persists user settings, and why it lives outside the project.

## Location

Findias writes a single JSON file, `findias-settings.json`, to Electron's
per-user **`userData`** directory (`app.getPath('userData')`). On Windows this
resolves to `%APPDATA%\<app name>\`.

The app name comes from `package.json`'s `"name"` field during development, and
from `electron-builder.yml`'s `productName` in a packaged build — so the folder
differs between the two:

| Context      | Command / build | Folder                                                       |
| ------------ | --------------- | ------------------------------------------------------------ |
| Development  | `npm run dev`   | `%APPDATA%\findias\` (lowercase, from `package.json` `name`) |
| Packaged app | installed build | `%APPDATA%\Findias\` (capital F, from `productName`)         |

Example (development, on this machine):

```
C:\Users\<user>\AppData\Roaming\findias\findias-settings.json
```

Example contents:

```json
{
  "gameRootPath": "D:\\Nexon\\Library\\mabinogi\\appdata"
}
```

> Because dev and packaged builds use different folders, they keep **independent**
> settings. Choosing a game folder in `npm run dev` will not carry over to the
> installed app, and vice versa. This is expected.

That `userData` folder also contains Chromium-managed directories Electron
creates automatically (`Cache`, `Code Cache`, `blob_storage`, etc.) — those are
not ours and can be ignored.

## Why it lives here (not in the repo)

- It is **per-user, per-machine** state, not source — it must not be committed.
- It survives app rebuilds, reinstalls, and updates.
- `app.getPath('userData')` is the OS-appropriate, standard location across
  platforms, so we never hardcode a path.

The write logic is in [`src/main/settingsStore.ts`](../src/main/settingsStore.ts):

```ts
function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE);
}
```

If the file is missing or corrupt, `loadSettings()` returns defaults, so a
bad/edited file can never crash startup.

## Finding or opening it

- Log the directory from the main process: `console.log(app.getPath('userData'))`.
- Or open it in the file explorer at runtime:
  `shell.openPath(app.getPath('userData'))` (handy for a future
  "Open settings folder" affordance in the UI).
