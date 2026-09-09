import path from "path"
import { fileURLToPath } from "url"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import * as Tool from "./tool"
import { lazy } from "@/util/lazy"
import { Language, type Node } from "web-tree-sitter"
import DESCRIPTION from "./symbols.txt"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "The symbol name pattern (substring or regular expression) to search for" }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of symbols to return. Defaults to 100.",
  }),
})

const GRAMMAR_BY_EXT = new Map<string, "bash" | "powershell">([
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["ps1", "powershell"],
  ["psm1", "powershell"],
])

const DEFINITION_KIND: Record<string, string> = {
  function_definition: "function",
  class_declaration: "class",
}

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parsers = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  await Parser.init({
    locateFile() {
      return resolveWasm(treeWasm)
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const { default: psWasm } = await import("tree-sitter-powershell/tree-sitter-powershell.wasm" as string, {
    with: { type: "wasm" },
  })
  const [bash, powershell] = await Promise.all([Language.load(resolveWasm(bashWasm)), Language.load(resolveWasm(psWasm))])
  const bashParser = new Parser()
  bashParser.setLanguage(bash)
  const psParser = new Parser()
  psParser.setLanguage(powershell)
  return { bash: bashParser, powershell: psParser }
})

const symbolName = (text: string) => {
  const match = /^\s*(?:function\s+)?([^\s{();]+)/.exec(text)
  return match?.[1]
}

function collectDefinitions(node: Node, into: Array<{ kind: string; name: string; row: number }>) {
  const kind = DEFINITION_KIND[node.type]
  if (kind) {
    const name = symbolName(node.text)
    if (name) into.push({ kind, name, row: node.startPosition.row + 1 })
    return
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) collectDefinitions(child, into)
  }
}

const symbolMatches = (name: string, query: string) => {
  try {
    return new RegExp(query, "i").test(name)
  } catch {
    return name.toLowerCase().includes(query.toLowerCase())
  }
}

export const SymbolsTool = Tool.define(
  "symbols",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string; limit?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = FSUtil.resolve(requested)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          const result = yield* ripgrep.grep({
            cwd,
            pattern: params.pattern,
            limit: 200,
          })
          if (result.length === 0) {
            return {
              title: params.pattern,
              metadata: { matches: 0, truncated: false },
              output: `No symbols found for pattern "${params.pattern}"`,
            }
          }

          const grammarParsers = yield* Effect.tryPromise(() => parsers()).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          const astSymbols: Array<{ file: string; kind: string; name: string; row: number }> = []
          const textMatches: Array<{ file: string; row: number; text: string }> = []
          const parsed = new Set<string>()
          for (const item of result) {
            const abs = path.resolve(cwd, item.entry.path)
            const ext = path.extname(abs).slice(1).toLowerCase()
            const grammar = GRAMMAR_BY_EXT.get(ext)
            if (!grammar || !grammarParsers || parsed.has(abs)) {
              textMatches.push({ file: abs, row: item.line, text: item.text })
              continue
            }
            parsed.add(abs)
            const content = yield* Effect.tryPromise(() => Bun.file(abs).text()).pipe(
              Effect.catch(() => Effect.succeed(undefined)),
            )
            if (content === undefined) {
              textMatches.push({ file: abs, row: item.line, text: item.text })
              continue
            }
            const tree = grammarParsers[grammar].parse(content)
            const found: Array<{ kind: string; name: string; row: number }> = []
            collectDefinitions(tree.rootNode, found)
            for (const def of found) {
              if (symbolMatches(def.name, params.pattern)) astSymbols.push({ file: abs, ...def })
            }
          }

          astSymbols.sort((a, b) => (a.file === b.file ? a.row - b.row : a.file.localeCompare(b.file)))
          const limit = params.limit ?? 100
          const selected = astSymbols.slice(0, limit)
          const output: string[] = []
          if (selected.length) {
            output.push(
              `Found ${astSymbols.length} symbol${astSymbols.length === 1 ? "" : "s"} matching "${params.pattern}"`,
            )
            let current = ""
            for (const sym of selected) {
              if (current !== sym.file) {
                if (current) output.push("")
                current = sym.file
                output.push(`${sym.file}:`)
              }
              output.push(`  ${sym.kind.toUpperCase()}: ${sym.name} (line ${sym.row})`)
            }
            if (astSymbols.length > limit) {
              output.push("")
              output.push(`(${astSymbols.length - limit} more symbols omitted. Use a narrower pattern or path.)`)
            }
          }
          if (textMatches.length) {
            if (selected.length) output.push("")
            output.push(
              `${textMatches.length} text match${textMatches.length === 1 ? "" : "es"} in languages without a bundled tree-sitter grammar:`,
            )
            output.push("(AST symbol extraction is available for bash, zsh, sh, ps1, and psm1 files.)")
            let current = ""
            for (const match of textMatches.slice(0, limit)) {
              if (current !== match.file) {
                if (current) output.push("")
                current = match.file
                output.push(`${match.file}:`)
              }
              output.push(`  Line ${match.row}: ${match.text}`)
            }
          }

          return {
            title: params.pattern,
            metadata: {
              matches: astSymbols.length + textMatches.length,
              truncated: astSymbols.length > limit,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)