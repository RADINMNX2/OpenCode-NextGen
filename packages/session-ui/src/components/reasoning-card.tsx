import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
  type Accessor,
  type JSX,
} from "solid-js"
import { animate, type AnimationPlaybackControls } from "motion"
import { createStore } from "solid-js/store"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { Icon } from "@opencode-ai/ui/icon"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"

const SPRING = { type: "spring" as const, visualDuration: 0.4, bounce: 0 }

export type ReasoningCardStatus = "thinking" | "completed" | "error"

export interface ReasoningCardProps {
  model?: string
  content?: string | Accessor<string>
  status?: ReasoningCardStatus
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  animated?: boolean
  children?: JSX.Element
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function ReasoningCard(props: ReasoningCardProps) {
  const i18n = useI18n()
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    startTime: undefined as number | undefined,
    elapsed: 0,
  })

  const open = () => props.open ?? state.open
  const status = createMemo(() => props.status ?? "thinking")
  const isThinking = createMemo(() => status() === "thinking")
  const content = createMemo(() => (typeof props.content === "function" ? props.content() : props.content) ?? "")

  let elapsedInterval: ReturnType<typeof setInterval> | undefined

  onCleanup(() => {
    if (elapsedInterval) clearInterval(elapsedInterval)
  })

  // Track elapsed time while thinking
  createEffect(
    on(
      isThinking,
      (thinking) => {
        if (thinking) {
          setState("startTime", performance.now())
          setState("elapsed", 0)
          elapsedInterval = setInterval(() => {
            if (state.startTime) {
              setState("elapsed", performance.now() - state.startTime)
            }
          }, 100)
        } else {
          if (elapsedInterval) {
            clearInterval(elapsedInterval)
            elapsedInterval = undefined
          }
        }
      },
      { defer: true },
    ),
  )

  const setOpen = (value: boolean) => {
    if (props.open === undefined) setState("open", value)
    props.onOpenChange?.(value)
  }

  // Animated height
  let contentRef: HTMLDivElement | undefined
  let heightAnim: AnimationPlaybackControls | undefined
  const initialOpen = open()

  createEffect(
    on(
      open,
      (isOpen) => {
        if (!props.animated || !contentRef) return
        heightAnim?.stop()
        if (isOpen) {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "auto" }, SPRING)
          void heightAnim.finished.then(() => {
            if (!contentRef || !open()) return
            contentRef.style.overflow = "visible"
            contentRef.style.height = "auto"
          })
        } else {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "0px" }, SPRING)
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    heightAnim?.stop()
  })

  return (
    <Collapsible
      open={open()}
      onOpenChange={setOpen}
      class="reasoning-card-collapsible"
      data-status={status()}
    >
      <Collapsible.Trigger>
        <div data-component="reasoning-card-trigger">
          <div data-slot="reasoning-card-header">
            <span data-component="reasoning-card-icon">
              <Switch>
                <Match when={isThinking()}>
                  <span data-slot="reasoning-card-thinking-icon" class="tool-radar-spin">
                    <Icon name="brain" size="small" />
                  </span>
                </Match>
                <Match when={status() === "completed"}>
                  <span data-slot="reasoning-card-done-icon" class="tool-check-pop">
                    <Icon name="brain" size="small" />
                  </span>
                </Match>
                <Match when={status() === "error"}>
                  <span data-slot="reasoning-card-error-icon">
                    <Icon name="circle-ban-sign" size="small" />
                  </span>
                </Match>
              </Switch>
            </span>

            <span data-slot="reasoning-card-label">
              <TextShimmer
                text={isThinking() ? i18n.t("ui.reasoningCard.thinking") : status() === "completed" ? i18n.t("ui.reasoningCard.thought") : i18n.t("ui.reasoningCard.failed")}
                active={isThinking()}
              />
            </span>

            <Show when={props.model}>
              <span data-slot="reasoning-card-model">{props.model}</span>
            </Show>

            <Show when={state.elapsed > 0}>
              <span data-slot="reasoning-card-duration">{formatElapsed(state.elapsed)}</span>
            </Show>

            <Show when={content().length > 0 || isThinking()}>
              <span data-slot="reasoning-card-chevron">
                <Icon name="chevron-down" size="small" />
              </span>
            </Show>
          </div>
        </div>
      </Collapsible.Trigger>

      <Show when={props.animated}>
        <div
          ref={contentRef}
          data-slot="reasoning-card-content"
          data-animated
          style={{
            height: initialOpen ? "auto" : "0px",
            overflow: initialOpen ? "visible" : "hidden",
          }}
        >
          <Show when={open()}>
            <div data-slot="reasoning-card-body">
              <Show when={content().length > 0}>
                <div data-slot="reasoning-card-text">{content()}</div>
              </Show>
              {props.children}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={!props.animated}>
        <Collapsible.Content>
          <Show when={open()}>
            <div data-slot="reasoning-card-body">
              <Show when={content().length > 0}>
                <div data-slot="reasoning-card-text">{content()}</div>
              </Show>
              {props.children}
            </div>
          </Show>
        </Collapsible.Content>
      </Show>
    </Collapsible>
  )
}
