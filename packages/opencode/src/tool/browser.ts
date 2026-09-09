import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./browser.txt"

type PlaywrightBrowser = import("playwright-core").Browser
type PlaywrightPage = import("playwright-core").Page

const UNAVAILABLE =
  "Browser automation needs the optional `playwright-core` dependency and a Chromium install. " +
  "Install from `packages/opencode` with `bun add playwright-core` followed by `bunx playwright install chromium`, " +
  "then retry this tool."

const TIMEOUT = 30_000

const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^localhost(:\d+)?($|\/)/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

let browserPromise: Promise<PlaywrightBrowser> | undefined
function browser() {
  if (!browserPromise) {
    browserPromise = import("playwright-core")
      .then(({ chromium }) => chromium.launch({ headless: true }))
      .catch((error) => {
        browserPromise = undefined
        throw error
      })
  }
  return browserPromise
}

let pagePromise: Promise<PlaywrightPage> | undefined
function page() {
  if (!pagePromise) {
    pagePromise = browser()
      .then((instance) => instance.newPage())
      .catch((error) => {
        pagePromise = undefined
        throw error
      })
  }
  return pagePromise
}

const withPage = <T>(run: (page: PlaywrightPage) => Promise<T>) =>
  Effect.gen(function* () {
    const current = yield* Effect.tryPromise(() => page()).pipe(Effect.mapError(() => new Error(UNAVAILABLE)))
    return yield* Effect.tryPromise(() => run(current)).pipe(Effect.timeout(TIMEOUT))
  })

const currentUrl = Effect.gen(function* () {
  const url = yield* Effect.tryPromise(() => page().then((current) => current.url())).pipe(
    Effect.catch(() => Effect.succeed("about:blank")),
  )
  return url
})

const ask = (ctx: Tool.Context, url: string, metadata: Record<string, unknown>) =>
  ctx.ask({
    permission: "webfetch",
    patterns: [url],
    always: ["*"],
    metadata,
  })

export const Parameters = Schema.Struct({
  action: Schema.Literal("browser_navigate", "browser_screenshot", "browser_click", "browser_fill", "browser_eval"),
  url: Schema.optional(Schema.String).annotate({
    description: 'Required for browser_navigate. The URL to load, e.g. "https://example.com". If the scheme is ' +
      "omitted, http:// is assumed for localhost and https:// otherwise.",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: 'Optional label for browser_screenshot, e.g. "homepage". Defaults to the current page title.',
  }),
  fullPage: Schema.optional(Schema.Boolean).annotate({
    description: "Optional for browser_screenshot. Capture the full scrollable page instead of just the viewport. Defaults to false.",
  }),
  selector: Schema.optional(Schema.String).annotate({
    description:
      "Required for browser_click and browser_fill. A Playwright CSS selector targeting the element, e.g. " +
      "button[data-testid='submit']. Discover real element selectors first with browser_eval.",
  }),
  value: Schema.optional(Schema.String).annotate({
    description: 'Required for browser_fill. The text to enter into the matched input.',
  }),
  expression: Schema.optional(Schema.String).annotate({
    description:
      'Required for browser_eval. A JavaScript expression body evaluated inside the page that returns a ' +
      'serializable value, e.g. "document.title + \' | \' + document.querySelectorAll(\'a\').length + \' links\'". ' +
      "Use it to read rendered text, layout state, and interactive element selectors.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

const navigate = Effect.fn("BrowserTool.navigate")(function* (params: { url: string }, ctx: Tool.Context) {
  yield* ask(ctx, params.url, { action: "browser_navigate", url: params.url })
  const result = yield* withPage(async (current) => {
    await current.goto(normalizeUrl(params.url), { waitUntil: "load", timeout: TIMEOUT })
    return { url: current.url(), title: await current.title() }
  })
  return {
    title: `Navigated to ${result.url}`,
    metadata: { url: result.url, title: result.title },
    output: `Navigated to ${result.url}\nPage title: ${result.title}`,
  }
})

const screenshot = Effect.fn("BrowserTool.screenshot")(function* (
  params: { name?: string; fullPage?: boolean },
  ctx: Tool.Context,
) {
  const url = yield* currentUrl
  yield* ask(ctx, url, { action: "browser_screenshot", name: params.name ?? "" })
  const result = yield* withPage(async (current) => {
    const bytes = await current.screenshot({ type: "png", fullPage: params.fullPage ?? false })
    const label = params.name?.trim() || (await current.title()) || "screenshot"
    const width = (await current.evaluate(() => document.documentElement.clientWidth)) as number
    return { label, base64: Buffer.from(bytes).toString("base64"), width }
  })
  const message = `Captured ${result.label} (${result.width}px wide)`
  return {
    title: message,
    metadata: { preview: message, width: result.width },
    output: message,
    attachments: [{ type: "file" as const, mime: "image/png", url: `data:image/png;base64,${result.base64}` }],
  }
})

const click = Effect.fn("BrowserTool.click")(function* (params: { selector: string }, ctx: Tool.Context) {
  const url = yield* currentUrl
  yield* ask(ctx, url, { action: "browser_click", selector: params.selector })
  yield* withPage(async (current) => {
    await current.locator(params.selector).first().click({ timeout: 5_000 })
  })
  return {
    title: `Clicked ${params.selector}`,
    metadata: {},
    output: `Clicked ${params.selector}`,
  }
})

const fill = Effect.fn("BrowserTool.fill")(function* (
  params: { selector: string; value: string },
  ctx: Tool.Context,
) {
  const url = yield* currentUrl
  yield* ask(ctx, url, { action: "browser_fill", selector: params.selector })
  yield* withPage(async (current) => {
    await current.locator(params.selector).first().fill(params.value, { timeout: 5_000 })
  })
  return {
    title: `Filled ${params.selector}`,
    metadata: {},
    output: `Filled ${params.selector} with "${params.value}"`,
  }
})

const evaluate = Effect.fn("BrowserTool.evaluate")(function* (
  params: { expression: string },
  ctx: Tool.Context,
) {
  const url = yield* currentUrl
  yield* ask(ctx, url, { action: "browser_eval", expression: params.expression })
  const serialized = yield* withPage(async (current) => {
    const value = await current.evaluate(`(() => { ${params.expression} })()`)
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  })
  return {
    title: "Evaluated expression",
    metadata: {},
    output: serialized,
  }
})

export const BrowserTool = Tool.define(
  "browser",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          switch (params.action) {
            case "browser_navigate":
              return yield* navigate({ url: params.url ?? "" }, ctx)
            case "browser_screenshot":
              return yield* screenshot({ name: params.name, fullPage: params.fullPage }, ctx)
            case "browser_click":
              return yield* click({ selector: params.selector ?? "" }, ctx)
            case "browser_fill":
              return yield* fill({ selector: params.selector ?? "", value: params.value ?? "" }, ctx)
            case "browser_eval":
              return yield* evaluate({ expression: params.expression ?? "" }, ctx)
            default:
              return yield* Effect.fail(new Error(`Unsupported browser action: ${params.action}`))
          }
        }).pipe(Effect.orDie),
    }
  }),
)