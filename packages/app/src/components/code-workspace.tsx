import { createMemo, For, Show } from "solid-js"
import { Dynamic, type ValidComponent } from "solid-js/web"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { resolveFileDiff, type DiffSource } from "@opencode-ai/session-ui/session-diff"
import { Icon } from "@opencode-ai/ui/icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useLanguage } from "@/context/language"

export interface FileTab {
  id: string
  path: string
  contents?: string
  fileDiff?: DiffSource
  modified?: boolean
}

export interface CodeWorkspaceProps {
  tabs: FileTab[]
  activeTab?: string
  onTabChange?: (tabId: string) => void
  onTabClose?: (tabId: string) => void
  onDiffToggle?: (unified: boolean) => void
  unified?: boolean
  class?: string
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const filename = path.split("/").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript JSX",
    js: "JavaScript",
    jsx: "JavaScript JSX",
    py: "Python",
    rs: "Rust",
    go: "Go",
    java: "Java",
    rb: "Ruby",
    css: "CSS",
    scss: "SCSS",
    html: "HTML",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    sql: "SQL",
    sh: "Shell",
    bash: "Shell",
    toml: "TOML",
    xml: "XML",
    vue: "Vue",
    svelte: "Svelte",
    graphql: "GraphQL",
    dockerfile: "Dockerfile",
  }
  if (filename === "dockerfile") return "Dockerfile"
  if (filename === "makefile") return "Makefile"
  return map[ext] ?? ext.toUpperCase()
}

function getLanguageBadgeColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: "#3178c6",
    "TypeScript JSX": "#3178c6",
    JavaScript: "#f7df1e",
    "JavaScript JSX": "#f7df1e",
    Python: "#3776ab",
    Rust: "#dea584",
    Go: "#00add8",
    Java: "#ed8b00",
    Ruby: "#cc342d",
    CSS: "#264de4",
    SCSS: "#cf649a",
    HTML: "#e34f26",
    JSON: "#292929",
    YAML: "#cb171e",
    Markdown: "#083fa1",
    Shell: "#89e051",
    TOML: "#9c4221",
  }
  return colors[lang] ?? "var(--text-weak)"
}

function BreadcrumbBar(props: {
  path: string
  language: string
  unified?: boolean
  onDiffToggle?: (unified: boolean) => void
}) {
  const language = useLanguage()
  const segments = createMemo(() => props.path.split("/").filter(Boolean))
  const badgeColor = createMemo(() => getLanguageBadgeColor(props.language))

  return (
    <div data-component="code-workspace-breadcrumb">
      <span data-slot="code-workspace-breadcrumb-icon">
        <Icon name="open-file" size="small" />
      </span>
      <For each={segments()}>
        {(segment, i) => (
          <span data-slot="code-workspace-breadcrumb-segment">
            <Show when={i() > 0}>
              <span data-slot="code-workspace-breadcrumb-sep">/</span>
            </Show>
            <span
              data-slot="code-workspace-breadcrumb-name"
              data-final={i() === segments().length - 1 ? "true" : undefined}
            >
              {segment}
            </span>
          </span>
        )}
      </For>
      <span data-slot="code-workspace-lang-badge" style={{ "background-color": badgeColor() }}>
        {props.language}
      </span>
      <Show when={props.onDiffToggle}>
        <span data-slot="code-workspace-breadcrumb-spacer" />
        <button
          data-slot="code-workspace-diff-toggle"
          onClick={() => props.onDiffToggle?.(!props.unified)}
          title={props.unified ? language.t("ui.codeWorkspace.diffSplit") : language.t("ui.codeWorkspace.diffUnified")}
        >
          {props.unified ? language.t("ui.codeWorkspace.diffSplit") : language.t("ui.codeWorkspace.diffUnified")}
        </button>
      </Show>
    </div>
  )
}

function renderFile(fileComponent: ValidComponent, tab: FileTab) {
  if (tab.fileDiff) {
    return (
      <Dynamic
        component={fileComponent}
        mode="diff"
        virtualize={false}
        fileDiff={resolveFileDiff(tab.fileDiff)}
      />
    )
  }
  return (
    <Dynamic
      component={fileComponent}
      mode="text"
      file={{ name: tab.path, contents: tab.contents ?? "", cacheKey: tab.path }}
    />
  )
}

export function CodeWorkspace(props: CodeWorkspaceProps) {
  const language = useLanguage()
  const fileComponent = useFileComponent()

  const activeTab = createMemo(() => {
    if (props.activeTab) return props.tabs.find((t) => t.id === props.activeTab)
    return props.tabs[0]
  })

  return (
    <div data-component="code-workspace" class={props.class}>
      <Show when={activeTab()}>
        <BreadcrumbBar
          path={activeTab()!.path}
          language={getLanguageFromPath(activeTab()!.path)}
          unified={props.unified}
          onDiffToggle={props.onDiffToggle}
        />
      </Show>

      <Show
        when={props.tabs.length > 1}
        fallback={
          <Show when={activeTab()}>
            <div data-slot="code-workspace-single-file">{renderFile(fileComponent, activeTab()!)}</div>
          </Show>
        }
      >
        <Tabs value={props.activeTab ?? props.tabs[0]?.id} onChange={(value) => value && props.onTabChange?.(value)}>
          <Tabs.List>
            <For each={props.tabs}>
              {(tab) => (
                <Tabs.Trigger value={tab.id}>
                  <span data-slot="code-workspace-tab">
                    <Show when={tab.modified}>
                      <span data-slot="code-workspace-tab-modified" />
                    </Show>
                    <span data-slot="code-workspace-tab-name">{tab.path.split("/").pop()}</span>
                    <button
                      data-slot="code-workspace-tab-close"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onTabClose?.(tab.id)
                      }}
                      aria-label={language.t("ui.codeWorkspace.closeTab", { name: tab.path })}
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                  </span>
                </Tabs.Trigger>
              )}
            </For>
          </Tabs.List>
          <For each={props.tabs}>
            {(tab) => (
              <Tabs.Content value={tab.id}>
                <div data-slot="code-workspace-file-content">{renderFile(fileComponent, tab)}</div>
              </Tabs.Content>
            )}
          </For>
        </Tabs>
      </Show>

      <Show when={props.tabs.length === 0}>
        <div data-slot="code-workspace-empty">
          <Icon name="code-lines" size="large" />
          <span data-slot="code-workspace-empty-text">{language.t("ui.codeWorkspace.noFiles")}</span>
          <span data-slot="code-workspace-empty-hint">{language.t("ui.codeWorkspace.openHint")}</span>
        </div>
      </Show>
    </div>
  )
}