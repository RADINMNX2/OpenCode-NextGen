# CHANGELOG_EVOLUTION.md

Transformation of the OpenCode super-environment across Milestones 1-4.

Scope note: every milestone was implemented and statically verified under the
constraint that the environment provides **no `bun`/`node_modules`** (no local
typecheck or test run possible) and that the running app/server must **never be
restarted**. All changes are source-level and activate on the next dev run.

---

## Milestone 1 — Foundation Rebrand, The Void Theme & Glassmorphism

Delivered the visual and behavioral foundation.

- **The Void rebrand**: product-wide identity rename; splash, onboarding, empty
  states, window titles.
- **Dark Void theme system** (`packages/ui/src/styles/theme.css` + v2
  `packages/ui/src/v2/styles/theme.css`): deep-space backgrounds, neon glow
  borders, glassmorphic surfaces via `backdrop-filter`, dedicated panel /
  toolbar / tooltip / icon-accent tokens, light + dark color-scheme blocks kept
  in lock-step.
- **Sidebar / recent chats** redesign with glass panels and hover glow.
- **PaneToolbar** (`packages/app/src/components/pane-toolbar.tsx`): Focus /
  Dual / Command Center mode buttons, file-tree toggle, terminal toggle, mono
  treatment, tooltip styling.
- **Settings & provider picker** restyled to the Void aesensody.
- **nanobrowser-fast semantics panel**: websocket + pubsub frame, signpost
  iconography, live shared-state status bar.
- Input ergonomics: type-to-focus, Escape-to-blur, titlebar tab nav.

## Milestone 2 — Workspace-Session Controller & Layout Modes

Introduced the WorkspacePane architecture; V1 session view left untouched.

- **`createWorkspaceSessionController`**
  (`packages/app/src/pages/session/workspace-session.ts`): reactive controller
  owning `mode` (focus | dual | command-center), file tabs, active file, and
  persistence to `opencode-workspace-pane` (localStorage).
- Toggles: `toggleCode`, `toggleTerminal`, `toggleFileTree`, `openFile`,
  `setMode`.
- **WorkspacePane** (`packages/app/src/components/workspace-pane.tsx`): chat /
  code / terminal slots composed by mode in `session.tsx`.
- **CodeWorkspace** file tabs + **TerminalPanelV2** stacked drawer.
- Legacy session view logic deliberately preserved; no speculative refactors.

## Milestone 3 — Advanced Tooling, Live Browser Preview & Sub-Agent Intelligence

- **Browser Preview pane** (`packages/app/src/components/browser-preview.tsx`
  + css): glassmorphic toolbar (back/forward/reload, address form, viewport
  chips Desktop/Tablet/Mobile), keyed iframe remount, sandboxed + no-referrer,
  loading bar; default target `http://localhost:4444`. Mounted behind a
  Code/Browser toggle in the workspace code slot.
- **BrowserTool** (`packages/opencode/src/tool/browser.ts`): single `browser`
  tool with `action` dispatcher (browser_navigate/screenshot/click/fill/eval),
  lazy `playwright-core` singleton, screenshots as `data:image/png`file
  attachments, `webfetch` permission per action; optional dep pinned 1.59.1.
- **Sub-agents** (`agent/agent.ts` + prompt txts): **planner** (Violet,
  read-only + webfetch/websearch, no todowrite) and **reviewer** (Amber,
  read-only, no todowrite); session-ui tones and v1/v2 theme tokens.

## Milestone 4 — Performance Optimization, Context Compaction, Parallelism & Final Polish

### Context compaction (Task 1)

Verified the compaction engine already implements the intelligent budget
strategy and strengthened its preservation contract:

- `SessionCompaction.isOverflow`: token-budget overflow detection.
- `select`: keep a recent-turn tail within `preserve_recent_tokens` (default
  25% of usable, clamped 2k-15k) with `splitTurn` partial-turn retention and
  `tail_turns` override.
- `prune`: erases outputs of completed tool calls beyond `PRUNE_PROTECT`
  (40k) once `PRUNE_MINIMUM` (20k) is reclaimed; protects `skill` parts;
  cleared parts serialize as `[Old tool result content cleared]`.
- `serialize`: truncates retained tool output to 2k chars; keeps decisions,
  files, errors.
- **New (this milestone)**: `agent/prompt/compaction.txt` instructs
  preserving **architectural decisions + rationale, user constraints /
  directives, invariants, and system-prompt-level anchors** even at the cost
  of terseness.

### Tool execution parallelism (Task 2)

Audited and confirmed multi-tool calls **already execute concurrently** in both
runtime paths — no code change was warranted (an unnecessary rewrite was
avoided):

- Native runtime: `llm/native-runtime.ts:120-135` forks each dispatched
  tool-call event into a `FiberSet`; concurrent drains.
- AI SDK path: `execute-tools-from-stream` awaits tool calls with
  `Promise.all` per step.
- Tool cards stream per-call start→input→result updates in real time;
  `processor.cleanup` awaits `ctx.toolcalls` with `concurrency: "unbounded"`.

### Global keyboard shortcuts & ergonomics (Task 3)

Session-scoped global keybinds through the command dispatcher
(`packages/app/src/context/command.tsx`), registered in
`use-session-commands.tsx`, wired in `session.tsx`:

| Keybind       | Command                          | Action                                  |
|---------------|----------------------------------|-----------------------------------------|
| `mod+b`       | `workspace.codeView`             | Toggle code workspace / browser preview |
| `mod+shift+f` | `workspace.layout.focus`         | Focus layout                            |
| `mod+shift+d` | `workspace.layout.dual`          | Dual layout                             |
| `mod+shift+c` | `workspace.layout.commandCenter` | Command Center layout                   |
| `mod+j`       | `workspace.terminal`             | Toggle bottom terminal drawer           |

- Platform-aware `mod` (Ctrl on Win/Linux, Cmd on macOS); remappable through
  the settings keybind catalog.
- Hotkey badges: PaneToolbar mode buttons show `Ctrl+Shift+F/D/C`, terminal
  button shows `Ctrl+J`; code-slot Code/Browser tabs show the live
  `workspace.codeView` keybind (including user remaps) via
  `command.keybind(...)`.
- Conflicts tracked: `mod+b` (sidebar.toggle) and `shift+mod+d` (composer)
  are pre-existing bindings; session commands win inside an open session by
  dispatcher ordering.
- i18n keys in `packages/app/src/i18n/en.ts`; keyboard legends exempt.

### Semantic search & AST code navigation (Task 4)

New **`symbols`** tool (`packages/opencode/src/tool/symbols.ts` + `symbols.txt`,
registered in `tool/registry.ts`):

- AST-aware definition queries via bundled **web-tree-sitter** grammars
  (bash / zsh / sh -> bash; ps1 / psm1 -> powershell), loading wasm exactly
  like `tool/shell.ts`.
- Walks parsed trees for `function_definition` / `class_declaration` nodes,
  reports `KIND: name (line)` per file — pattern matched against AST symbol
  names rather than whole-file regex.
- Non-grammar files fall back to clearly-labeled text matches (honest
  provenance).
- Uses the `grep` permission and external-directory assertion (mirrors
  `grep.ts`).

### Final polish & system verification (Task 5)

- **Timeline virtualization audit** (`packages/app/src/pages/session/timeline/`):
  already built on `@tanstack/solid-virtual` with custom `rangeExtractor`
  (overscan 50), variable-size `measureElement` + ResizeObserver, reconnect-
  aware offset adapter (MutationObserver), per-session snapshot cache, and
  keyed row reconciliation. Design supports 60fps at 1000+ messages; concrete
  benchmark verification is blocked in this environment (no tooling, never-
  restart rule).
- **Glassmorphism / Void token consistency**: all four panes (chat, toolbar,
  code/browser slot, terminal) share the M1 token stack; planner (violet) and
  reviewer (amber) identifiers exist in both v1 + v2 theme blocks.
- **This document** — comprehensive evolution record.

---

## Environment constraints honored

- Never restart the app or server.
- No production benchmark baseline recordable (tooling blocked).
- No `fs_patch` (known corrupting) — exact-match `edit`/`write` only.
- Source-level changes verified by targeted static checks; no `bun` typecheck
  run was possible.