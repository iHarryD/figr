# CLAUDE.md

Behavioral guidelines for working in the `frontend/` directory of Figr Inspector. These sit on top of any repo-wide rules and apply to every change made in this folder.

**Tradeoff:** These guidelines bias toward caution and surgical edits over speed and cleverness. For trivial edits, use judgment — but when in doubt, follow the rules.

---

## 0. Project at a glance

Figr Inspector is a Vite-powered React + TypeScript app that renders a design-inspection UI around an iframe-mounted preview of the backend's static pages. State lives in Zustand stores. All styling is Tailwind. Communication with the preview iframe goes through a `postMessage` protocol.

Stack boundaries (do not drift outside these without being asked):

- **Build / dev**: Vite (`vite.config.ts`, dev server on port 3000).
- **Framework**: React 18 (`StrictMode` is on — expect double-invocation of effects in dev).
- **Language**: TypeScript, `strict: true`, `noUnusedLocals`, `noUnusedParameters`.
- **Styling**: Tailwind 3 with a small custom palette in `tailwind.config.ts` (`panel-bg`, `panel-border`, `panel-text`, `panel-muted`, `outline-hover`, `outline-selected`) and one `@layer components` class (`panel-surface`) in `src/index.css`. No CSS-in-JS, no CSS modules, no inline `style` for anything static.
- **State**: Zustand stores under `src/state/`, re-exported from `src/state/index.ts`.
- **Networking**: Axios via `src/api/index.ts`.
- **Iframe protocol**: typed messages built with `makeMsg` from `src/protocol/`.

Folder layout under `src/` (keep it this flat — see rule 3):

```
agent/       — reserved; empty today
api/         — axios client, HTTP helpers
components/  — all React components, PascalCase.tsx (plus components/board/)
errors/      — reserved; empty today
hooks/       — reserved; empty today
protocol/    — postMessage schema + makeMsg
state/       — Zustand stores, one domain per file
types/       — shared TypeScript types
utilities/   — framework-agnostic helpers (cn, pending, layerUtils, devFlags)
```

Entry point: `src/main.tsx` → `components/App.tsx`.

---

## 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before writing code:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

Figr-specific traps that are worth pausing on:

- Changes that touch the preview iframe almost always have two sides. If you're editing a message handler in `src/protocol/` or anything that talks to `window.postMessage`, confirm whether the matching change in `backend/pages/*` is in scope — don't quietly edit backend files from this folder.
- "Add a store" and "add a field to an existing store" look similar but have different blast radii. Prefer the latter.
- React 18 `StrictMode` double-invokes effects in dev. If you see something "firing twice," that's expected — don't paper over it with refs or flags unless asked.

---

## 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Figr-specific flavors of over-engineering to avoid:

- **Don't introduce a new Zustand store** when a field on an existing one in `src/state/` is enough. Stores are per-domain, not per-feature.
- **Don't wrap components in `React.memo`, `useMemo`, or `useCallback`** unless a measured perf issue requires it. Zustand selectors already keep renders tight.
- **Don't build generic UI primitives** (`<Button>`, `<Modal>`, etc.) unless there are already two call sites that need them. Inline the Tailwind classes.
- **Don't create a new file in `hooks/`, `errors/`, or `agent/`** just because the folder exists. Those are empty by design — only populate when the code genuinely needs that home.
- **Don't add a feature flag or a `devFlags` entry** unless you need to toggle at runtime. See `src/utilities/devFlags.ts` for what already exists.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style — single quotes, 2-space indent, semicolons, arrow-function components (`export const Foo = () => { ... }`), named exports (no `default` exports in `src/components/`), `.tsx` for components and `.ts` for everything else.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that **your** changes made unused (TypeScript will flag these — `noUnusedLocals` is on).
- Don't remove pre-existing dead code unless asked.

Figr-specific guardrails:

- **Don't reorganize `src/` subfolders.** The layout above is the layout. No per-feature folders, no `components/<feature>/` nesting unless one already exists (`components/board/` is the sole exception).
- **Don't change the Tailwind config, PostCSS config, Vite config, or `tsconfig.json`** unless the task explicitly asks you to. These are intentionally minimal.
- **Don't touch `backend/pages/*.html`** from a frontend task. If the preview contract needs to change, call it out and ask.
- **Don't add dependencies** without saying so first. The current set (`axios`, `clsx`, `tailwind-merge`, `zustand`) is deliberately small.
- **Don't rename exports** that are re-exported through a barrel (`src/state/index.ts`, `src/utilities/index.ts`). If you must, update the barrel in the same change.

The test: every changed line should trace directly to the user's request.

---

## 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write a check for invalid inputs, demonstrate it rejects them."
- "Fix the selection bug" → "Describe the reproduction, change the code, confirm the repro no longer triggers."
- "Refactor the layers panel" → "Enumerate the panel's observable behaviors, confirm each still works after the edit."

For multi-step tasks, state a brief plan before diving in:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Figr-specific verification steps that are cheap and worth running:

- `npm run dev` (from `frontend/`) and visually confirm the change in the browser. The dev server runs on **port 3000**.
- Reload with the preview iframe pointed at `backend/pages/page-1.html` (or whichever page the task implies). If the task touches hover/selection/layers, test with at least two pages to catch iframe-reload races.
- Open the devtools console. There should be no new warnings — React key warnings, Zustand "selector returned a new object" warnings, and `postMessage` origin warnings all count.
- If TypeScript would catch the mistake, let it: trust `strict` mode. There is no separate `tsc` or lint script wired up, so the dev server's type errors are your signal.

Weak criteria ("make it work") require constant clarification. Strong criteria let you loop independently.

---

## 5. House style — the short list

A few conventions worth being explicit about so you don't have to re-derive them from the codebase each turn:

- **Components**: named arrow-function exports, `.tsx`, PascalCase filename matches the export (`InspectorPanel.tsx` exports `InspectorPanel`).
- **Stores**: one Zustand store per domain file in `src/state/`, exported as `useXxxStore`. Access from outside React with `useXxxStore.getState()` — see `App.tsx` for the pattern.
- **Styling**: Tailwind classes only. Use `cn()` from `src/utilities/cn.ts` for conditional classes. Reach for the custom `panel-*` palette tokens before raw hex.
- **Imports**: relative paths (no path aliases are configured). Barrels exist for `state/` and `utilities/` — prefer importing from them over deep paths.
- **No comments** unless the *why* is non-obvious. Don't narrate what the code does; the names and types already do that.
- **No `console.log`** in committed code unless it's gated behind `devFlags`.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
