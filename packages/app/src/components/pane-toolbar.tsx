import { For } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import type { LayoutMode } from "./workspace-pane"

export interface PaneToolbarProps {
  mode: LayoutMode
  onModeChange?: (mode: LayoutMode) => void
  onToggleFileTree?: () => void
  onToggleTerminal?: () => void
  fileTreeOpen?: boolean
  terminalOpen?: boolean
  class?: string
}

const MODES = [
  {
    mode: "focus",
    icon: "expand",
    labelKey: "ui.paneToolbar.mode.focus",
    descriptionKey: "ui.paneToolbar.mode.focus.description",
    keybind: "Ctrl+Shift+F",
  },
  {
    mode: "dual",
    icon: "layout-left-partial",
    labelKey: "ui.paneToolbar.mode.dual",
    descriptionKey: "ui.paneToolbar.mode.dual.description",
    keybind: "Ctrl+Shift+D",
  },
  {
    mode: "command-center",
    icon: "layout-bottom-full",
    labelKey: "ui.paneToolbar.mode.commandCenter",
    descriptionKey: "ui.paneToolbar.mode.commandCenter.description",
    keybind: "Ctrl+Shift+C",
  },
] as const

function ToolbarButton(props: {
  icon: string
  label: string
  description?: string
  keybind?: string
  active?: boolean
  onClick?: (event: MouseEvent) => void
}) {
  const tip = () => (
    <span data-slot="pane-toolbar-tooltip">
      {props.description ?? props.label}
      {props.keybind ? <span data-slot="pane-toolbar-keybind">{props.keybind}</span> : null}
    </span>
  )
  return (
    <Tooltip value={tip()} placement="top">
      <button
        data-slot="pane-toolbar-btn"
        data-active={props.active ? "true" : undefined}
        onClick={props.onClick}
        aria-label={props.label}
      >
        <Icon name={props.icon as any} size="small" />
      </button>
    </Tooltip>
  )
}

export function PaneToolbar(props: PaneToolbarProps) {
  const language = useLanguage()

  return (
    <div data-component="pane-toolbar" class={props.class}>
      <div data-slot="pane-toolbar-modes">
        <For each={MODES}>
          {(item) => (
            <ToolbarButton
              icon={item.icon}
              label={language.t(item.labelKey)}
              description={language.t(item.descriptionKey)}
              keybind={item.keybind}
              active={props.mode === item.mode}
              onClick={() => props.onModeChange?.(item.mode)}
            />
          )}
        </For>
      </div>

      <span data-slot="pane-toolbar-divider" />

      <div data-slot="pane-toolbar-toggles">
        <ToolbarButton
          icon="file-tree"
          label={language.t("ui.paneToolbar.toggleFileTree")}
          active={props.fileTreeOpen}
          onClick={props.onToggleFileTree}
        />
        <ToolbarButton
          icon="console"
          label={language.t("ui.paneToolbar.toggleTerminal")}
          keybind="Ctrl+J"
          active={props.terminalOpen}
          onClick={props.onToggleTerminal}
        />
      </div>
    </div>
  )
}