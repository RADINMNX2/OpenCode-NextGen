import { batch, createEffect, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part, ToolPart } from "@opencode-ai/sdk/v2"
import type { DiffSource } from "@opencode-ai/session-ui/session-diff"
import type { FileTab } from "@/components/code-workspace"
import type { LayoutMode } from "@/components/workspace-pane"

const STORAGE_KEY = "opencode-workspace-pane"

function readPersistedMode(): LayoutMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const mode = raw ? (JSON.parse(raw) as { mode?: unknown }).mode : undefined
    return mode === "focus" || mode === "dual" || mode === "command-center" ? mode : "focus"
  } catch {
    return "focus"
  }
}

function persistMode(mode: LayoutMode) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const state = raw ? JSON.parse(raw) : {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, mode }))
  } catch {}
}

function diffSourceForFilediff(value: unknown, input: Record<string, unknown>): DiffSource | undefined {
  const filediff = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
  const file =
    (filediff && typeof filediff.file === "string" && filediff.file) ||
    (typeof input.filePath === "string" && input.filePath) ||
    (typeof input.file === "string" && input.file)
  const patch = filediff && typeof filediff.patch === "string" ? filediff.patch : undefined
  const before = filediff && typeof filediff.before === "string" ? filediff.before : undefined
  const after = filediff && typeof filediff.after === "string" ? filediff.after : undefined
  if (!file || (typeof patch !== "string" && before === undefined && after === undefined)) return
  return { file, patch, before, after }
}

function diffSourceForPatchRaw(raw: unknown): DiffSource | undefined {
  if (!raw || typeof raw !== "object") return
  const value = raw as Record<string, unknown>
  const file =
    (typeof value.relativePath === "string" && value.relativePath) ||
    (typeof value.filePath === "string" && value.filePath)
  if (!file) return
  const patch = typeof value.patch === "string" ? value.patch : typeof value.diff === "string" ? value.diff : undefined
  const before = typeof value.before === "string" ? value.before : undefined
  const after = typeof value.after === "string" ? value.after : undefined
  if (typeof patch !== "string" && before === undefined && after === undefined) return
  return { file, patch, before, after }
}

function tabsForToolPart(part: ToolPart): FileTab[] {
  const input = part.state.input as Record<string, unknown>

  if (part.tool === "write") {
    const path = typeof input.path === "string" ? input.path : undefined
    if (!path) return []
    const contents = typeof input.content === "string" ? input.content : undefined
    return [{ id: path, path, contents, modified: true }]
  }

  if (part.tool === "edit") {
    const metadata = part.state.status === "completed" ? part.state.metadata : undefined
    const source = diffSourceForFilediff(metadata?.filediff, input)
    if (!source) return []
    return [{ id: source.file, path: source.file, fileDiff: source, modified: true }]
  }

  if (part.tool === "apply_patch") {
    const metadata = part.state.status === "completed" ? part.state.metadata : undefined
    const files = metadata?.files
    if (!Array.isArray(files)) return []
    const tabs: FileTab[] = []
    for (const raw of files) {
      const source = diffSourceForPatchRaw(raw)
      if (!source) continue
      tabs.push({ id: source.file, path: source.file, fileDiff: source, modified: true })
    }
    return tabs
  }

  return []
}

export interface WorkspaceSessionController {
  mode: () => LayoutMode
  setMode: (mode: LayoutMode) => void
  toggleCode: () => void
  toggleTerminal: () => void
  toggleFileTree: () => void
  tabs: FileTab[]
  activeId: () => string | undefined
  setActiveId: (id: string) => void
  openFile: (path: string, contents?: string) => void
  openModification: (tab: FileTab) => void
  closeTab: (id: string) => void
}

export function createWorkspaceSessionController(input: {
  sessionID: () => string | undefined
  partMap: () => Record<string, readonly Part[] | undefined>
  syncTerminal?: (open: boolean) => void
}): WorkspaceSessionController {
  const [mode, setModeState] = createSignal<LayoutMode>(readPersistedMode())
  const [tabs, setTabs] = createStore<FileTab[]>([])
  const [activeId, setActiveId] = createSignal<string | undefined>()

  const setMode = (next: LayoutMode) => {
    setModeState(next)
    persistMode(next)
    if (next === "command-center") input.syncTerminal?.(true)
    if (next === "focus") input.syncTerminal?.(false)
  }

  const openModification = (tab: FileTab) => {
    batch(() => {
      if (mode() === "focus") setMode("dual")
      const index = tabs.findIndex((item) => item.id === tab.id)
      if (index >= 0) setTabs(index, tab)
      else setTabs(tabs.length, tab)
      setActiveId(tab.id)
    })
  }

  const openFile = (path: string, contents?: string) => {
    batch(() => {
      const index = tabs.findIndex((item) => item.id === path)
      if (index < 0) setTabs(tabs.length, { id: path, path, contents })
      setActiveId(path)
    })
  }

  const closeTab = (id: string) => {
    const index = tabs.findIndex((item) => item.id === id)
    if (index < 0) return
    setTabs(tabs.filter((item) => item.id !== id))
    if (activeId() === id) setActiveId(tabs[index + 1]?.id ?? tabs[index - 1]?.id)
  }

  const handled = new Set<string>()

  createEffect(() => {
    const id = input.sessionID()
    if (!id) return
    const map = input.partMap()
    for (const key in map) {
      const parts = map[key]
      if (!parts) continue
      for (const part of parts) {
        if (!part || part.type !== "tool") continue
        if (part.sessionID !== id) continue
        if (part.state.status !== "completed") continue
        const compact = `${part.messageID}:${part.id}`
        if (handled.has(compact)) continue
        handled.add(compact)
        const opened = tabsForToolPart(part)
        for (const tab of opened) openModification(tab)
      }
    }
  })

  return {
    mode,
    setMode,
    toggleCode: () => setMode(mode() === "focus" ? "dual" : "focus"),
    toggleTerminal: () => setMode(mode() === "command-center" ? "focus" : "command-center"),
    toggleFileTree: () => setMode(mode() === "command-center" ? "dual" : "command-center"),
    tabs,
    activeId,
    setActiveId,
    openFile,
    openModification,
    closeTab,
  }
}