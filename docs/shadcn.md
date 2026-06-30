# shadcn/ui Theming

How the Findias renderer's design system is generated, and the standardized
procedure for changing it — whether nudging a few colors or swapping the whole
style — without clobbering our local edits.

See also the [Theming section in architecture.md](./architecture.md#theming) for
the high-level stack rationale.

## Current setup

The design system is generated from a single [shadcn/create](https://ui.shadcn.com/create)
preset and lives entirely in CSS variables — there is no `tailwind.config.js`
(Tailwind v4 is CSS-first).

| Thing            | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| Preset           | `b1Vn0UwC`                                                      |
| Style            | Luma (`radix-luma`)                                             |
| Base / component | `radix`                                                         |
| Base color       | `neutral`                                                       |
| Theme color      | `cyan`                                                          |
| Icons            | `lucide`                                                        |
| Font             | Noto Sans (self-hosted — see modifications below)               |
| Radius           | default (`0.625rem`)                                            |
| Mode             | system / light / dark via our `ThemeProvider` (default: system) |
| Button cursor    | `cursor: pointer` restored (see `--pointer` below)              |

The preset is the source of truth and is reproducible at any time:

```bash
cd /c/code/Findias && npx shadcn@latest preset decode b1Vn0UwC
```

What the CLI owns / writes:

| File                               | Written by                | Notes                                               |
| ---------------------------------- | ------------------------- | --------------------------------------------------- |
| `components.json`                  | `init` / `apply`          | style, base color, icon library, aliases            |
| `src/renderer/index.css`           | `apply --only theme,font` | the `:root` / `.dark` / `@theme inline` token block |
| `src/renderer/components/ui/*.tsx` | full `apply`, `add`       | vendored primitives — **reinstalled** on full apply |

Electron-vite integration glue (set up once; not theme data, but the reason the
CLI works in this repo at all):

- Root [`vite.config.ts`](../vite.config.ts) — a shim that exists **only** so the
  shadcn CLI can detect a Vite + Tailwind project. The app builds via
  `electron.vite.config.ts`; tests via `vitest.config.ts`.
- [`electron.vite.config.ts`](../electron.vite.config.ts) — `tailwindcss()` plugin
  - the `@` → `src/renderer` alias on `renderer`.
- `tsconfig.json` — `baseUrl` + `paths` so the CLI resolves `@/*`.

## Procedure A — Tweak the theme (keep the current style)

Use this when you only want different colors, radius, or font but are **keeping the
current style** — i.e. the `style` value in `components.json` doesn't change (today
that's Luma, but this procedure applies to whatever style is current). It rewrites
only the token block in `index.css` and never touches the vendored components — the
safest path.

1. **Clean the git tree.** Commit or stash any in-progress work first; `git diff` is
   how you'll review and undo what the CLI rewrites.

   ```bash
   cd /c/code/Findias && git switch -c chore/shadcn-retheme
   ```

2. **Build + verify the new preset.** Make your choices on
   [shadcn/create](https://ui.shadcn.com/create), copy the preset code, and decode it
   to confirm before applying:

   ```bash
   cd /c/code/Findias && npx shadcn@latest preset decode <newId>
   ```

3. **Apply only the theme** (add `font` only if you changed the font — but see the
   font note in the modifications list; we self-host):

   ```bash
   cd /c/code/Findias && npx shadcn@latest apply --preset <newId> --only theme
   ```

   `apply` keeps the current `base` and RTL settings from `components.json` even if
   the preset was generated with different values.

4. **Re-apply local modifications** the CLI overwrote (see the list below), then verify.

5. **Verify:**

   ```bash
   cd /c/code/Findias && npm run typecheck && npm test && npm run build && npm run dev
   ```

   If anything's wrong, `git restore src/renderer/index.css` reverts cleanly.

6. **Update the source of truth:** change the preset id in this doc and in
   [architecture.md](./architecture.md#theming).

## Procedure B — Fresh theme install (change the style)

Use this when changing the **style itself** — i.e. the new preset's `style` differs
from the current one in `components.json` (for example, switching away from Luma to
another shadcn style). This is more invasive: a full `apply` reinstalls every
vendored `ui/*` primitive, so any hand-edits to those files are overwritten. Budget
time to re-layer them afterward.

1. **Clean the git tree + branch** (same as Procedure A, step 1).

2. **Build + decode the new preset** (same as Procedure A, step 2). On
   [shadcn/create](https://ui.shadcn.com/create), pick the new style, base color,
   theme, font, icons.

3. **Apply the full preset:**

   ```bash
   cd /c/code/Findias && npx shadcn@latest apply --preset <newId>
   ```

   This rewrites `components.json`, the `index.css` token block, and **reinstalls all
   `components/ui/*` primitives**.

4. **Re-layer every local modification** (the list below) — this is the step that
   bites on a full reinstall, because `ui/*` is regenerated.

5. **Verify** (same commands as Procedure A, step 5). With a full reinstall, also
   smoke-test the actual UI in `npm run dev`, since component geometry/spacing changes
   with the style.

6. **Update the source of truth** in this doc + [architecture.md](./architecture.md#theming).

> Per the [shadcn CLI docs](https://ui.shadcn.com/docs/cli), `init`/`apply` only
> detect a root `vite.config.*`. That shim already exists, so no extra setup is
> needed — but don't delete it.

## The `--pointer` (button cursor) option

`--pointer` enables `cursor: pointer` on buttons (Tailwind v4 defaults them to the
normal cursor). **It is not part of preset codes** and `apply` has **no** `--pointer`
flag — it's an `init`-only setup option (like `--rtl`). So regenerating a preset
won't carry it. The reliable way to get it is to add the CSS by hand to the
`@layer base` block in `src/renderer/index.css` (this is **already applied** — see
the custom base layer in modification #2):

```css
@layer base {
  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }
}
```

Because we maintain a custom base layer (below), this lives there permanently and
survives re-themes.

## Local modifications to re-apply on reinstall

These are deliberate deviations from a stock shadcn install. After any `apply` that
touches the relevant file, re-apply these (verify with `git diff`).

### 1. Noto Sans is self-hosted (not Google Fonts)

The preset wants a Google-hosted `@import` for Noto Sans. We replaced it with the
self-hosted [`@fontsource-variable/noto-sans`](https://www.npmjs.com/package/@fontsource-variable/noto-sans)
package (bundled woff2) so the font works offline and within the renderer's strict
CSP (no external font request).

- Package: `@fontsource-variable/noto-sans` in `package.json` dependencies.
- In `src/renderer/index.css`:

  ```css
  @import '@fontsource-variable/noto-sans';
  ```

  and the `@theme inline` token value:

  ```css
  --font-sans: 'Noto Sans Variable', sans-serif;
  ```

After a re-theme, delete any Google Fonts `@import` the CLI added and restore these
two lines.

### 2. Custom base layer in `index.css`

Stock shadcn only emits the `* { @apply border-border outline-ring/50; }` rule and a
`body` background/foreground rule. We extended `@layer base` for the
fixed-viewport Electron window:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html,
  body,
  #root {
    @apply h-full;
  }
  body {
    @apply overflow-hidden bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }
}
```

The `h-full` (html/body/#root), `overflow-hidden`, `font-sans`, and the
button `cursor: pointer` rules are ours — re-add them.

### 3. Theme mode — system / light / dark (our own provider)

The app supports **system, light, and dark** modes. There is no `next-themes`
dependency; we ship a small provider following the
[shadcn Vite dark-mode pattern](https://ui.shadcn.com/docs/dark-mode/vite):

- [`components/theme-provider.tsx`](../src/renderer/components/theme-provider.tsx) —
  exposes `ThemeProvider` + `useTheme`, plus `THEMES` (the canonical value set, from
  which the `Theme` union is derived) and an `isTheme` guard. It persists the choice
  in `localStorage` (`findias-theme`, default `system`), applies `.dark` / `.light`
  to `<html>` via a layout effect, and live-follows `prefers-color-scheme` while set
  to `system`. Persisting in `localStorage` (not the main-process settings JSON)
  keeps it a pure renderer concern and avoids a startup IPC round-trip / theme flash
  (a future consolidation into `findias-settings.json` is tracked in
  [project-overview.md](./project-overview.md) under Stretch Features).
- Mounted at the top of [`main.tsx`](../src/renderer/main.tsx), outside the rest of
  the providers.
- The user control is the **Appearance** item in
  [`SettingsView.tsx`](../src/renderer/components/SettingsView.tsx): a shadcn `Tabs`
  segmented control (System / Light / Dark) whose options are generated by iterating
  `THEMES`, with the labels/icons supplied by the view.
- `components/ui/sonner.tsx` is wired to **our** `useTheme` (not `next-themes`) and
  passes the preference straight through to Sonner's `theme` prop.
- [`index.html`](../src/renderer/index.html) has **no** `class="dark"` hardcode — the
  provider owns the `<html>` class.

**On reinstall / re-theme:** a fresh `sonner.tsx` from the CLI imports `useTheme`
from `next-themes`. Re-point that import at `@/components/theme-provider` instead of
adding `next-themes`. The provider, the `main.tsx` mount, the SettingsView item, and
the absent `class="dark"` are all ours to preserve.
