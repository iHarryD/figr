# Figr Inspector — Frontend

React + Vite + TypeScript + Tailwind. Run everything with one command from the repo root:

```
npm run dev
```

Backend API at `:4000`, page server at `:4001`, Vite dev server at `:3000`.

---

## Ambiguous requirements and decisions

**Active preview**

The spec defines it as "the preview the user last clicked in Select mode." The layers panel tracks `activeScreenId` as the last screen where any selection happened — a keyboard nav or a row click in the layers panel updates it too, not just a mouse click. This matches expected product behaviour even if it's a looser reading.

**Ctrl+wheel over iframes**

Wheel events over an iframe go to the iframe's document, not the host. The agent intercepts ctrl/meta wheel events, calls `preventDefault()` to block the browser's native zoom, and forwards them as a `wheel` message with page-relative coordinates. The host adds the iframe's bounding rect offset to convert to viewport coordinates before running the zoom formula.

**Selection outlines in Interact mode**

The spec says the selection should be hidden in Interact mode and reappear when switching back. `Overlay` skips `selectedRects` entirely when `mode === 'interact'`, so outlines are hidden. The selection state is preserved in the store and re-rendered when switching back to Select mode.

**"Nothing happens at the top level" for Shift+Enter**

Top-level means direct children of `<body>`. The agent's `getRelatives` handler excludes `<body>` as a valid parent result, so Shift+Enter on a top-level element returns nothing and the selection doesn't move. Tab wrapping among body's direct children still works via `firstSibling`/`lastSibling`.

**Tab wrapping with no siblings**

For an element that is its parent's only child, Tab/Shift+Tab re-selects the same element. Technically wrapping, just not interesting.

**Page errors and `report()`**

Each `pageError` message from the agent calls `report()` once. A page with a recurring error (e.g., a `setInterval` that throws) will produce a call per occurrence. The spec's "exactly once" means don't double-report a single event, not deduplicate across repeated events.

**"Region is gone" (R6.6)**

Requests cancelled via `AbortController` are silently discarded — AbortErrors never reach `report()`. No per-navigation epoch counter is implemented, so `getChildren` responses that arrive after a preview navigates will write into the freshly-cleared layers slice. The practical consequence is covered below.

**Search coverage**

The agent runs `document.body.querySelectorAll('*')` on every query, covering the full live DOM including elements whose rows haven't been loaded into the layers store yet.

---

## State organisation

Nine Zustand stores, one domain per file in `src/state/`. Each store owns its slice exclusively.

| Store | Key fields | Who writes |
|---|---|---|
| `board` | `pan`, `zoom`, `mode` | `Board` (pan/zoom), `App`/`Toolbar` (mode), `Preview` (forwarded key events from agent) |
| `screens` | `status`, `list`, `error`, `retryCount` | `Board` on mount and retry |
| `previews` | per-screen: `status`, `agentReady`, `pageError`, `error` | `Preview` on iframe `load`/`error` and agent `ready`/`pageError` |
| `selection` | `screenId`, `eids[]`, `anchorEid`, `noLongerExists` | `Preview` (agent `click`, `eidRemap`, `navigated`), `App` (keyboard nav), `LayersPanel` (row click), `Board` (empty-space click) |
| `hover` | `{ screenId, eid, rect } \| null` | `Preview` (agent `pointer`), `LayersPanel` (row hover), `Board` (cleared on pan/zoom) |
| `layers` | per-screen: `rowsById`, `rootIds`, `expanded`, `scroll`, `searchResults`, `preSearchExpanded`, `focusedEid` | `LayersPanel` + `loadChildren`/`expandToEid`; `Preview` (agent `mutation`); `clearSlice` on navigation |
| `details` | per `data-key`: `status`, `data`, `error`, `requestId` | `InspectorPanel` (fetch lifecycle) |
| `live` | per eid: computed style + geometry | `Preview` (agent `live`); cleared by `InspectorPanel` on selection change |
| `rects` | per-screen, per-eid: `{ x, y, width, height }` | `Preview` (agent `rects`); cleared on screen switch |

The agent writes rect data, live data, and DOM tree structure. The host writes selection, hover, and mode. Neither side touches the other's state directly — the postMessage protocol is the boundary.

The `details` store guards against stale responses by storing a `requestId` per key. `setData`, `setNoDetails`, and `setError` all bail if the incoming `requestId` doesn't match the current one, so a slow fetch for a previously selected element can't overwrite data for the current selection.

---

## Host ↔ page protocol

### Setup

The agent (`public/agent.js`) is served from `localhost:3000` and injected via a single `<script>` tag in each page. It runs in the page's execution context, with `postMessage` to `event.source` (the host frame) for outbound messages.

### Handshake

1. Host posts `hello { screenId }` after the iframe's `load` event fires.
2. Agent stores `event.source` as `hostWindow` and replies `ready {}`.
3. Host records `agentReady: true`, caches `contentWindow`, and sends the current mode.
4. If no `ready` arrives within 10 seconds, the preview shows an error and calls `report()`. The timer clears on `ready` or on the next `load`.

### Messages host → agent

| Kind | Payload | Effect |
|---|---|---|
| `hello` | `{ screenId }` | Starts the session; agent captures the host window ref |
| `setMode` | `{ mode }` | `'select'`: installs capture-phase listeners that block page interactions and emit pointer/click/key messages. `'interact'`: removes them, restores normal page behaviour, adds a non-blocking listener for V/I/Escape only |
| `subscribeRects` | `{ eids[] }` | Agent tracks rects for these eids via ResizeObserver + ancestor scroll listeners, batched per animation frame |
| `getLive` | `{ eids[] }` | Agent streams computed style + geometry via ResizeObserver + MutationObserver; empty array clears all subscriptions |
| `getChildren` | `{ eid }` | Direct children of the element, or of `<body>` when `eid === 'body'` |
| `getAncestors` | `{ eid }` | Ancestor chain from the element's parent up to (not including) `<body>` |
| `getRelatives` | `{ eid }` | `parent`, `firstChild`, `prevSibling`, `nextSibling`, `firstSibling`, `lastSibling` — used for keyboard nav and Tab wrapping |
| `search` | `{ query }` | Full-DOM `querySelectorAll`, up to 100 results with ancestor breadcrumbs |
| `scrollIntoView` | `{ eid }` | `element.scrollIntoView({ block: 'nearest' })` — moves the page, not the board |
| `devFail` | `{ kind }` | Arms a one-shot dev fault for the next relevant operation |

### Messages agent → host

| Kind | Payload | When |
|---|---|---|
| `ready` | `{}` | After receiving `hello` |
| `pointer` | `{ eid, rect, name }` | pointermove in select mode, RAF-throttled; null fields clear hover |
| `click` | `{ eid, shift, rect, name }` | Capture-phase click in select mode; null eid means background |
| `key` | `{ key, shift, ctrl, meta }` | Forwarded keydown so shortcuts work while the iframe has focus |
| `wheel` | `{ deltaY, clientX, clientY, ctrlKey }` | Ctrl+wheel after `preventDefault()` on the native event |
| `rects` | `{ updates[] }` | Rect update for a subscribed eid |
| `live` | `{ eid, name, tag, id, classes, w, h, x, y, text, color, bg, fontFamily, fontSize, fontWeight }` | Style or geometry change for a live-subscribed eid |
| `mutation` | `{ parentEid }` | Child-list change detected, debounced 16 ms |
| `eidRemap` | `{ remaps[], removed[] }` | Post-mutation: elements whose path changed (remaps) or whose node is gone (removed) |
| `navigated` | `{}` | `pagehide` — page is leaving |
| `pageError` | `{ message }` | `window.onerror` or `unhandledrejection` |
| `response` | `{ to, ok, data?, error? }` | Reply to a request, matched by the request's `id` |

### Request correlation

Every host → agent request carries a unique monotonic `id`. `sendRequest` (`src/utilities/pending.ts`) registers a promise for that id with a timeout (3 s for tree queries, 5 s for search). The `message` handler in `Preview.tsx` resolves or rejects it when a matching `response` arrives. Responses with no registered id — late arrivals after timeout or navigation — are dropped.

### Slow responses

- `getChildren` times out after 3 s. The row shows "Couldn't load" with a retry that re-fires the request and calls `report()` again on failure.
- Agent handshake times out after 10 s. The preview shows an error; `report()` is called.
- `/screens` and `/elements/:key` use `AbortController`. Cancellation is silent; real failures call `report()`.

### Navigation

The agent fires `navigated` on `pagehide`. The host clears that preview's selection, live data, and layers slice. The new page triggers a fresh `load` → `hello` → `ready` cycle and the current mode is re-sent.

Any requests in flight for the old page time out and get reported as failures. That's technically wrong since navigation was the cause, not a real error — an epoch counter on the preview would suppress them.

If the host is refreshed, the agent's `hostWindow` goes stale and its messages vanish. The next `hello` from the fresh host resets it.

---

## Where this breaks

**Path-based identity on full subtree re-renders**

An element's eid is either `key:<data-key>` or a structural path like `path:div[0]>ul[2]>li[1]`. The agent tracks the DOM node reference and emits `eidRemap` when a live node's path shifts — so inserting a sibling before a selected element is handled. But if the page destroys and recreates the node itself (common in frameworks that remount a whole component tree), the agent sees the old node disappear and emits `removed`. The selection is lost. Only `data-key` elements survive this. Identical unnamed siblings that genuinely swap positions have the same problem — the eid follows the node, so the remap is correct, but there's no way to distinguish "moved" from "replaced by an identical element."

**In-flight `getChildren` across navigation**

`clearSlice` runs when a `navigated` message arrives, but any pending `getChildren` promise resolves afterward and writes children from the old page into the now-empty slice. The new page's `clearSlice` (fired on its own `navigated`) eventually cleans it up, but there's a window where the layers panel shows stale content. Tagging responses with a navigation epoch would let the host drop them.

**Search clear race**

`savePreSearchState` snapshots the expanded set the first time a search runs. If the user clears the query before the response arrives, `restorePreSearchState` runs first, then the in-flight `setSearchResults` fires and puts search view back on screen. The 200 ms debounce makes it unlikely. An AbortController on the search request would close it.

**24 live iframes**

All iframes load on mount. On a slow connection the initial page load is heavy. This is fine for the stated scope; virtualising with IntersectionObserver would be the fix at scale.

**Elements under sticky or fixed headers**

`elementFromPoint` returns the topmost element. Something fully covered by a sticky header can't be hovered or clicked. Tab/Enter still reaches it via keyboard nav.

**`localhost:3000` hardcoded in page scripts**

The `<script src="http://localhost:3000/agent.js">` tags in the backend HTML files break on any other host or port.
