import { createStore, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"

export type BrowserViewport = "desktop" | "tablet" | "mobile"

const DEFAULT_URL = "http://localhost:4444"

const VIEWPORTS = [
  { viewport: "desktop", titleKey: "ui.browserPreview.viewport.desktop" },
  { viewport: "tablet", titleKey: "ui.browserPreview.viewport.tablet" },
  { viewport: "mobile", titleKey: "ui.browserPreview.viewport.mobile" },
] as const

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^localhost(:\d+)?($|\/)/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

interface BrowserPreviewState {
  viewport: BrowserViewport
  url: string
  input: string
  history: string[]
  index: number
  reload: number
  loading: boolean
}

export interface BrowserPreviewProps {
  class?: string
  initialUrl?: string
}

export function BrowserPreview(props: BrowserPreviewProps) {
  const language = useLanguage()
  const initial = props.initialUrl ?? DEFAULT_URL

  const [state, setState] = createStore<BrowserPreviewState>({
    viewport: "desktop",
    url: initial,
    input: initial,
    history: [initial],
    index: 0,
    reload: 0,
    loading: true,
  })

  const commit = (url: string) =>
    setState((s) => {
      const history = s.history.slice(0, s.index + 1)
      history.push(url)
      return { ...s, url, input: url, history, index: history.length - 1, reload: s.reload + 1, loading: true }
    })

  const back = () => {
    if (state.index <= 0) return
    const url = state.history[state.index - 1]
    setState({ index: state.index - 1, url, input: url, reload: state.reload + 1, loading: true })
  }

  const forward = () => {
    if (state.index >= state.history.length - 1) return
    const url = state.history[state.index + 1]
    setState({ index: state.index + 1, url, input: url, reload: state.reload + 1, loading: true })
  }

  const reload = () => setState({ reload: state.reload + 1, loading: true })

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const url = normalizeUrl(state.input)
    if (url) commit(url)
    else setState({ input: state.url })
  }

  return (
    <div data-component="browser-preview" class={props.class}>
      <div data-slot="browser-preview-toolbar">
        <div data-slot="browser-preview-navigation">
          <button
            data-slot="browser-preview-btn"
            aria-label={language.t("ui.browserPreview.back")}
            disabled={state.index <= 0}
            onClick={back}
          >
            <Icon name="arrow-left" size="small" />
          </button>
          <button
            data-slot="browser-preview-btn"
            aria-label={language.t("ui.browserPreview.forward")}
            disabled={state.index >= state.history.length - 1}
            onClick={forward}
          >
            <Icon name="arrow-right" size="small" />
          </button>
          <button data-slot="browser-preview-btn" aria-label={language.t("ui.browserPreview.reload")} onClick={reload}>
            <Icon name="arrow-undo-down" size="small" />
          </button>
        </div>

        <form data-slot="browser-preview-address" role="search" onSubmit={submit}>
          <Icon name="square-arrow-top-right" size="small" />
          <input
            value={state.input}
            aria-label={language.t("ui.browserPreview.addressLabel")}
            placeholder={language.t("ui.browserPreview.addressPlaceholder")}
            spellcheck={false}
            onInput={(event) => setState("input", event.currentTarget.value)}
          />
        </form>

        <div data-slot="browser-preview-viewport">
          <For each={VIEWPORTS}>
            {(item) => (
              <button
                data-slot="browser-preview-viewport-chip"
                data-active={state.viewport === item.viewport ? "true" : undefined}
                title={language.t(item.titleKey)}
                onClick={() => setState("viewport", item.viewport)}
              >
                {language.t(item.titleKey)}
              </button>
            )}
          </For>
        </div>
      </div>

      <div data-slot="browser-preview-body" data-viewport={state.viewport} data-loading={state.loading ? "true" : undefined}>
        <Show when={{ url: state.url, reload: state.reload }} keyed>
          {(target) => (
            <iframe
              src={target.url}
              title={language.t("ui.browserPreview.title")}
              referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={() => setState("loading", false)}
            />
          )}
        </Show>
      </div>
    </div>
  )
}