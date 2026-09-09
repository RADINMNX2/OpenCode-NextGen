import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  type Accessor,
  type JSX,
} from "solid-js"
import { animate, type AnimationPlaybackControls } from "motion"
import { createStore } from "solid-js/store"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import type { IconProps } from "@opencode-ai/ui/icon"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Icon } from "@opencode-ai/ui/icon"

export type ToolCategory = "read" | "write" | "shell" | "task" | "error" | "default"

export type ToolCardStatus = "pending" | "running" | "completed" | "error"

export type TriggerTitle = {
  title: string
  titleClass?: string
  subtitle?: string
  subtitleClass?: string
  args?: string[]
  argsClass?: string
  action?: JSX.Element
}

const isTriggerTitle = (val: unknown): val is TriggerTitle => {
  return (
    typeof val === "object" &&
    val !== null &&
    "title" in val &&
    (typeof Node === "undefined" || !(val instanceof Node))
  )
}

export interface ToolCardProps {
  icon: IconProps["name"]
  trigger: TriggerTitle | JSX.Element | ((open: Accessor<boolean>) => JSX.Element)
  children?: JSX.Element
  status?: ToolCardStatus | string
  category?: ToolCategory
  hideDetails?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  forceOpen?: boolean
  allowOpenWhilePending?: boolean
  defer?: boolean
  locked?: boolean
  animated?: boolean
  duration?: number
  onRetry?: () => void
  onSubtitleClick?: () => void
  onTriggerClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>
  onTriggerKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>
  triggerHref?: string
  triggerAsLink?: boolean
  clickable?: boolean
}

const SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0 }
const deferredMounts: Array<{ active: boolean; fn: () => void }> = []
let deferredFrame: number | undefined

function flushDeferredMounts() {
  while (deferredMounts.length > 0) {
    const item = deferredMounts.pop()!
    if (item.active) {
      deferredFrame = deferredMounts.length > 0 ? requestAnimationFrame(flushDeferredMounts) : undefined
      item.fn()
      return
    }
  }
  deferredFrame = undefined
}

function scheduleDeferredFlush() {
  if (deferredFrame !== undefined) return
  deferredFrame = requestAnimationFrame(() => {
    deferredFrame = requestAnimationFrame(flushDeferredMounts)
  })
}

function scheduleDeferredMount(fn: () => void) {
  const item = { active: true, fn }
  deferredMounts.push(item)
  scheduleDeferredFlush()
  return () => {
    item.active = false
  }
}

function scheduleFrameMount(fn: () => void) {
  const frame = requestAnimationFrame(fn)
  return () => cancelAnimationFrame(frame)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getCategoryAccent(category: ToolCategory): string {
  switch (category) {
    case "read":
      return "cyan"
    case "write":
      return "emerald"
    case "shell":
      return "amber"
    case "task":
      return "violet"
    case "error":
      return "error"
    default:
      return "cyan"
  }
}

function resolveCategory(toolName: string): ToolCategory {
  const readTools = ["read", "glob", "grep", "webfetch", "websearch"]
  const writeTools = ["write", "edit", "apply_patch"]
  const shellTools = ["shell", "bash"]
  const taskTools = ["task"]

  if (readTools.includes(toolName)) return "read"
  if (writeTools.includes(toolName)) return "write"
  if (shellTools.includes(toolName)) return "shell"
  if (taskTools.includes(toolName)) return "task"
  return "default"
}

function StatusIndicator(props: { status: ToolCardStatus; accent: string }) {
  return (
    <span data-component="tool-card-status" data-status={props.status} data-accent={props.accent}>
      <Switch>
        <Match when={props.status === "pending" || props.status === "running"}>
          <span data-slot="tool-card-status-pending">
            <span data-component="tool-card-radar" />
          </span>
        </Match>
        <Match when={props.status === "completed"}>
          <span data-slot="tool-card-status-done" class="tool-check-pop">
            <Icon name="check" size="small" />
          </span>
        </Match>
        <Match when={props.status === "error"}>
          <span data-slot="tool-card-status-error" class="tool-error-shake">
            <Icon name="circle-ban-sign" size="small" />
          </span>
        </Match>
      </Switch>
    </span>
  )
}

export function ToolCard(props: ToolCardProps) {
  const i18n = useI18n()
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    ready: !props.defer && (props.defaultOpen ?? false),
    startTime: undefined as number | undefined,
    elapsed: 0,
  })

  const open = () => props.open ?? state.open
  const ready = () => state.ready
  const pending = () => props.status === "pending" || props.status === "running"
  const hasChildren = () => (props.defer ? "children" in props : props.children)
  const dynamicTrigger = typeof props.trigger === "function" ? props.trigger(open) : undefined
  const category = createMemo(() => props.category ?? "default")
  const accent = createMemo(() => getCategoryAccent(category()))
  const status = createMemo(() => (props.status as ToolCardStatus) ?? "pending")

  let cancelReady: (() => void) | undefined
  let elapsedInterval: ReturnType<typeof setInterval> | undefined

  const cancel = () => {
    cancelReady?.()
    cancelReady = undefined
  }

  const scheduleReady = (initial = false) => {
    cancel()
    cancelReady = (initial ? scheduleDeferredMount : scheduleFrameMount)(() => {
      cancelReady = undefined
      if (!open()) return
      setState("ready", true)
    })
  }

  onCleanup(() => {
    cancel()
    if (elapsedInterval) clearInterval(elapsedInterval)
  })

  onMount(() => {
    if (props.defer && open()) scheduleReady(true)
  })

  const setOpen = (value: boolean) => {
    if (props.open === undefined) setState("open", value)
    props.onOpenChange?.(value)
  }

  createEffect(() => {
    if (!props.forceOpen) return
    if (open()) return
    setOpen(true)
  })

  createEffect(
    on(
      open,
      (value) => {
        if (!props.defer) return
        if (!value) {
          cancel()
          setState("ready", false)
          return
        }
        scheduleReady()
      },
      { defer: true },
    ),
  )

  // Track duration when running
  createEffect(
    on(
      pending,
      (isPending) => {
        if (isPending) {
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

  // Animated height for collapsible open/close
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

  const handleOpenChange = (value: boolean) => {
    if (pending() && !props.allowOpenWhilePending) return
    if (props.locked && !value) return
    setOpen(value)
  }

  const trigger = () => (
    <div
      data-component="tool-card-trigger"
      data-clickable={props.clickable ? "true" : undefined}
      data-hide-details={props.hideDetails ? "true" : undefined}
    >
      <div data-slot="tool-card-trigger-content">
        <StatusIndicator status={status()} accent={accent()} />
        <div data-slot="tool-card-info">
          <Switch>
            <Match when={dynamicTrigger !== undefined}>{dynamicTrigger}</Match>
            <Match when={isTriggerTitle(props.trigger) && props.trigger}>
              {(title) => (
                <div data-slot="tool-card-info-structured">
                  <div data-slot="tool-card-info-main">
                    <span
                      data-slot="tool-card-title"
                      classList={{
                        [title().titleClass ?? ""]: !!title().titleClass,
                      }}
                    >
                      <TextShimmer text={title().title} active={pending()} />
                    </span>
                    <Show when={!pending() || title().subtitle || title().args?.length}>
                      <Show when={title().subtitle}>
                        <span
                          data-slot="tool-card-subtitle"
                          classList={{
                            [title().subtitleClass ?? ""]: !!title().subtitleClass,
                            clickable: !!props.onSubtitleClick,
                          }}
                          onClick={(e) => {
                            if (props.onSubtitleClick) {
                              e.stopPropagation()
                              props.onSubtitleClick()
                            }
                          }}
                        >
                          {title().subtitle}
                        </span>
                      </Show>
                      <Show when={title().args?.length}>
                        <For each={title().args}>
                          {(arg) => (
                            <span
                              data-slot="tool-card-arg"
                              classList={{
                                [title().argsClass ?? ""]: !!title().argsClass,
                              }}
                            >
                              {arg}
                            </span>
                          )}
                        </For>
                      </Show>
                    </Show>
                  </div>
                  <Show when={!pending() && title().action}>
                    <span data-slot="tool-card-action">{title().action}</span>
                  </Show>
                </div>
              )}
            </Match>
            <Match when={true}>{props.trigger as JSX.Element}</Match>
          </Switch>
        </div>
        <Show when={pending() && state.elapsed > 0}>
          <span data-slot="tool-card-duration">{formatDuration(state.elapsed)}</span>
        </Show>
        <Show when={status() === "error" && props.onRetry}>
          <button
            data-component="tool-card-retry"
            onClick={(e) => {
              e.stopPropagation()
              props.onRetry?.()
            }}
            aria-label={i18n.t("ui.toolErrorCard.retry")}
          >
            <Icon name="refresh" size="small" />
          </button>
        </Show>
      </div>
      <Show when={hasChildren() && !props.hideDetails && !props.locked && (!pending() || props.allowOpenWhilePending)}>
        <Collapsible.Arrow />
      </Show>
    </div>
  )

  return (
    <Collapsible
      open={open()}
      onOpenChange={handleOpenChange}
      class="tool-card-collapsible"
      data-accent={accent()}
    >
      <Show
        when={props.triggerAsLink || props.triggerHref}
        fallback={
          <Collapsible.Trigger
            data-hide-details={props.hideDetails ? "true" : undefined}
            onClick={props.onTriggerClick}
          >
            {trigger()}
          </Collapsible.Trigger>
        }
      >
        <Collapsible.Trigger
          as="a"
          href={props.triggerHref}
          role={!props.triggerHref && props.clickable ? "button" : undefined}
          tabIndex={!props.triggerHref && props.clickable ? 0 : undefined}
          data-hide-details={props.hideDetails ? "true" : undefined}
          onClick={props.onTriggerClick}
          onKeyDown={props.onTriggerKeyDown}
        >
          {trigger()}
        </Collapsible.Trigger>
      </Show>
      <Show when={props.animated && hasChildren() && !props.hideDetails}>
        <div
          ref={contentRef}
          data-slot="tool-card-content"
          data-animated
          style={{
            height: initialOpen ? "auto" : "0px",
            overflow: initialOpen ? "visible" : "hidden",
          }}
        >
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </div>
      </Show>
      <Show when={!props.animated && hasChildren() && !props.hideDetails}>
        <Collapsible.Content>
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </Collapsible.Content>
      </Show>
    </Collapsible>
  )
}

function label(input: Record<string, unknown> | undefined) {
  const keys = ["description", "query", "url", "filePath", "path", "pattern", "name"]
  return keys.map((key) => input?.[key]).find((value): value is string => typeof value === "string" && value.length > 0)
}

function args(input: Record<string, unknown> | undefined) {
  if (!input) return []
  const skip = new Set(["description", "query", "url", "filePath", "path", "pattern", "name"])
  return Object.entries(input)
    .filter(([key]) => !skip.has(key))
    .flatMap(([key, value]) => {
      if (typeof value === "string") return [`${key}=${value}`]
      if (typeof value === "number") return [`${key}=${value}`]
      if (typeof value === "boolean") return [`${key}=${value}`]
      return []
    })
    .slice(0, 3)
}

export function GenericToolCard(props: {
  tool: string
  status?: ToolCardStatus | string
  hideDetails?: boolean
  input?: Record<string, unknown>
  onRetry?: () => void
}) {
  const i18n = useI18n()
  const category = createMemo(() => resolveCategory(props.tool))

  return (
    <ToolCard
      icon="mcp"
      status={props.status}
      category={category()}
      trigger={{
        title: i18n.t("ui.basicTool.called", { tool: props.tool }),
        subtitle: label(props.input),
        args: args(props.input),
      }}
      hideDetails={props.hideDetails}
      onRetry={props.onRetry}
    />
  )
}
