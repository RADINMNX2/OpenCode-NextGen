import { batch, createEffect, createMemo, createSignal, For, Show, type JSX, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"

export type LayoutMode = "focus" | "dual" | "command-center"

export interface WorkspacePaneState {
  mode: LayoutMode
  fileTreeWidth: number
  chatWidth: number
  codeWidth: number
  terminalHeight: number
  fileTreeOpen: boolean
  terminalOpen: boolean
  codeOpen: boolean
}

const STORAGE_KEY = "opencode-workspace-pane"

const DEFAULTS: WorkspacePaneState = {
  mode: "focus",
  fileTreeWidth: 260,
  chatWidth: 520,
  codeWidth: 480,
  terminalHeight: 280,
  fileTreeOpen: true,
  terminalOpen: false,
  codeOpen: false,
}

function loadState(): WorkspacePaneState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveState(state: WorkspacePaneState, controlled: boolean) {
  try {
    if (controlled) {
      const raw = localStorage.getItem(STORAGE_KEY)
      const previous = raw ? (JSON.parse(raw) as { mode?: unknown }) : {}
      const mode =
        previous.mode === "focus" || previous.mode === "dual" || previous.mode === "command-center"
          ? previous.mode
          : state.mode
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, mode }))
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  } catch {}
}

export interface WorkspacePaneProps {
  fileTree?: JSX.Element
  chat: JSX.Element
  code?: JSX.Element
  terminal?: JSX.Element
  toolbar?: JSX.Element
  mode?: LayoutMode
  onSetMode?: (mode: LayoutMode) => void
  onModeChange?: (mode: LayoutMode) => void
}

export function WorkspacePane(props: ParentProps<WorkspacePaneProps>) {
  const [state, setState] = createStore<WorkspacePaneState>(loadState())

  const mode = () => props.mode ?? state.mode
  const fileTreeVisible = createMemo(
    () => (props.mode !== undefined || state.fileTreeOpen) && mode() === "command-center" && !!props.fileTree,
  )
  const codeVisible = createMemo(
    () =>
      (props.mode !== undefined || state.codeOpen) &&
      (mode() === "dual" || mode() === "command-center") &&
      !!props.code,
  )
  const terminalVisible = createMemo(
    () => (props.mode !== undefined || state.terminalOpen) && mode() === "command-center" && !!props.terminal,
  )

  createEffect(() => {
    saveState(state, props.mode !== undefined)
  })

  createEffect(() => {
    props.onModeChange?.(mode())
  })

  const setMode = (mode: LayoutMode) => {
    batch(() => {
      if (mode === "focus") {
        setState("codeOpen", false)
        setState("fileTreeOpen", false)
        setState("terminalOpen", false)
      }
      if (mode === "dual") {
        setState("codeOpen", true)
        setState("fileTreeOpen", false)
        setState("terminalOpen", false)
      }
      if (mode === "command-center") {
        setState("codeOpen", true)
        setState("fileTreeOpen", true)
        setState("terminalOpen", true)
      }
      if (props.onSetMode) props.onSetMode(mode)
      else if (props.mode === undefined) setState("mode", mode)
    })
  }

  const gridStyle = createMemo(() => {
    const columns: string[] = []
    if (fileTreeVisible()) columns.push(`${state.fileTreeWidth}px`)
    if (mode() === "focus") columns.push("1fr")
    else columns.push(`${state.chatWidth}px`)
    if (codeVisible()) columns.push(`${state.codeWidth}px`)
    if (columns.length === 0) columns.push("1fr")
    return {
      "grid-template-columns": columns.join(" "),
      "grid-template-rows": terminalVisible() ? `1fr ${state.terminalHeight}px` : "1fr",
    }
  })

  return (
    <div data-component="workspace-pane" data-mode={mode()}>
      <Show when={props.toolbar}>
        <div data-slot="workspace-pane-toolbar">{props.toolbar}</div>
      </Show>

      <div data-slot="workspace-pane-grid" style={gridStyle()}>
        <Show when={fileTreeVisible()}>
          <div data-slot="workspace-pane-file-tree">{props.fileTree}</div>
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={state.fileTreeWidth}
            min={200}
            max={400}
            onResize={(size) => setState("fileTreeWidth", size)}
          />
        </Show>

        <div
          data-slot="workspace-pane-chat"
          style={{
            "min-width": mode() === "focus" ? "0" : "300px",
          }}
        >
          {props.chat}
        </div>

        <Show when={codeVisible()}>
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={state.codeWidth}
            min={320}
            max={900}
            onResize={(size) => setState("codeWidth", size)}
          />
          <div data-slot="workspace-pane-code">{props.code}</div>
        </Show>

        <Show when={terminalVisible()}>
          <ResizeHandle
            direction="vertical"
            edge="start"
            size={state.terminalHeight}
            min={120}
            max={600}
            onResize={(size) => setState("terminalHeight", size)}
            collapseThreshold={80}
            onCollapse={() => setState("terminalOpen", false)}
          />
          <div data-slot="workspace-pane-terminal">{props.terminal}</div>
        </Show>
      </div>

      {props.children}
    </div>
  )
}

export function useWorkspacePane() {
  const STORAGE_KEY = "opencode-workspace-pane"

  const [mode, setMode] = createSignal<LayoutMode>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw).mode ?? "focus" : "focus"
    } catch {
      return "focus"
    }
  })

  const setPersistedMode = (next: LayoutMode) => {
    setMode(next)
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const state = raw ? JSON.parse(raw) : {}
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, mode: next }))
    } catch {}
  }

  const toggleCode = () => {
    const current = mode()
    if (current === "focus") setPersistedMode("dual")
    else if (current === "dual") setPersistedMode("focus")
  }

  const toggleTerminal = () => {
    const current = mode()
    if (current === "focus") setPersistedMode("command-center")
    else if (current === "command-center") setPersistedMode("focus")
  }

  return { mode, setMode: setPersistedMode, toggleCode, toggleTerminal }
}