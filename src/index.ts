/**
 * OpenCode Statusline Plugin
 *
 * Collects configurable status items (git branch, changed lines, openspec progress, etc.)
 * and writes the output to a tmux pane status file.
 *
 * Each tmux pane gets its own status file, so multiple opencode
 * instances in split panes show independent project status.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { writeFileSync, unlinkSync, existsSync, readFileSync, appendFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Debug ───────────────────────────────────────────────────────────

const DEBUG = process.env.OPENCODE_STATUS_DEBUG === "1"
const DEBUG_FILE = "/tmp/opencode-statusline-debug.log"

function debug(msg: string, ...args: unknown[]) {
  if (!DEBUG) return
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg} ${args.map(a => JSON.stringify(a)).join(" ")}\n`
  try { appendFileSync(DEBUG_FILE, line, "utf-8") } catch {}
}

// ── Types ──────────────────────────────────────────────────────────

interface StatusItem {
  type: "git-branch" | "git-diff" | "openspec" | "custom"
  format?: string
  command?: string
  maxLength?: number
}

interface PluginConfig {
  items: StatusItem[]
  separator: string
  refreshInterval: number
  periodicInterval: number
}

// ── Defaults ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: PluginConfig = {
  items: [
    { type: "custom", command: "basename \"$(pwd)\"", format: "📁 {output}" },
    { type: "git-branch", format: "🌿 {branch}" },
    { type: "git-diff", format: "📝 +{added} ~{deleted}" },
    { type: "openspec", format: "{status}" },
  ],
  separator: " │ ",
  refreshInterval: 3000,
  periodicInterval: 10000,
}

// ── Config loader ──────────────────────────────────────────────────

const CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "statusline.json"),
  join(homedir(), ".config", "opencode", "statusline.jsonc"),
]

function loadConfig(): PluginConfig {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8")
        const parsed = JSON.parse(raw)
        return {
          items: parsed.items ?? DEFAULT_CONFIG.items,
          separator: parsed.separator ?? DEFAULT_CONFIG.separator,
          refreshInterval: parsed.refreshInterval ?? DEFAULT_CONFIG.refreshInterval,
          periodicInterval: parsed.periodicInterval ?? DEFAULT_CONFIG.periodicInterval,
        }
      } catch {}
    }
  }
  return DEFAULT_CONFIG
}

// ── Helpers ────────────────────────────────────────────────────────

const STATUS_PREFIX =
  process.env.OPENCODE_STATUS_PREFIX ?? "/tmp/opencode-pane-status-"

function sanitizePane(pane: string): string {
  return pane.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function getStatusFile(): string | null {
  const pane = process.env.TMUX_PANE
  if (!pane) return null
  return `${STATUS_PREFIX}${sanitizePane(pane)}`
}

function truncate(s: string, max?: number): string {
  if (max === undefined || s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

// ── Status collectors ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShellFn = (parts: TemplateStringsArray, ...args: string[]) => any

async function collectGitBranch($: ShellFn, directory: string): Promise<string> {
  try {
    const r = await $`git branch --show-current`.cwd(directory).nothrow().quiet()
    return (r.stdout?.toString() ?? "").trim()
  } catch {
    return ""
  }
}

async function collectGitDiff($: ShellFn, directory: string): Promise<{ added: number; deleted: number }> {
  try {
    const r = await $`git diff --numstat`.cwd(directory).nothrow().quiet()
    const lines = (r.stdout?.toString() ?? "").trim().split("\n").filter(Boolean)
    let added = 0, deleted = 0
    for (const line of lines) {
      const [a, d] = line.split("\t")
      added += parseInt(a, 10) || 0
      deleted += parseInt(d, 10) || 0
    }
    return { added, deleted }
  } catch {
    return { added: 0, deleted: 0 }
  }
}

async function collectOpenspec($: ShellFn, directory: string): Promise<string> {
  try {
    const scriptPath = join(__dirname, "..", "scripts", "openspec-status.sh")
    const r = await $`bash "${scriptPath}" 2>/dev/null`.cwd(directory).nothrow().quiet()
    return (r.stdout?.toString() ?? "").trim()
  } catch {
    return ""
  }
}

async function collectCustom($: ShellFn, command: string, directory: string): Promise<string> {
  try {
    const r = await $`${command} 2>/dev/null`.cwd(directory).nothrow().quiet()
    return (r.stdout?.toString() ?? "").trim()
  } catch {
    return ""
  }
}

// ── Format ─────────────────────────────────────────────────────────

function formatItem(item: StatusItem, data: Record<string, string | number>): string {
  let fmt = item.format ?? ""
  for (const [key, value] of Object.entries(data)) {
    fmt = fmt.replace(`{${key}}`, String(value))
  }
  return truncate(fmt, item.maxLength)
}

// ── Main plugin ────────────────────────────────────────────────────

export const StatuslinePlugin: Plugin = async ({ $, directory }) => {
  debug("===== STATUSLINE PLUGIN INIT =====")
  debug("directory", directory)
  debug("TMUX_PANE", process.env.TMUX_PANE ?? "NOT SET")
  debug("__dirname", __dirname)

  const config = loadConfig()
  debug("config", config)

  const statusFile = getStatusFile()
  debug("statusFile", statusFile ?? "NULL")

  let pending: ReturnType<typeof setTimeout> | null = null
  let lastWrite = 0

  async function refresh() {
    debug("refresh called, statusFile=", statusFile ?? "NULL")
    if (!statusFile) {
      debug("SKIP: no statusFile")
      return
    }

    try {
      const parts: string[] = []

      for (const item of config.items) {
        debug("processing item", { type: item.type })
        switch (item.type) {
          case "git-branch": {
            const branch = await collectGitBranch($, directory)
            debug("git-branch result", branch)
            if (branch) {
              parts.push(formatItem(item, { branch }))
            }
            break
          }
          case "git-diff": {
            const { added, deleted } = await collectGitDiff($, directory)
            debug("git-diff result", { added, deleted })
            if (added > 0 || deleted > 0) {
              parts.push(formatItem(item, { added, deleted }))
            }
            break
          }
          case "openspec": {
            const status = await collectOpenspec($, directory)
            debug("openspec result", status)
            if (status && !status.includes("no active change")) {
              parts.push(formatItem(item, { status }))
            }
            break
          }
          case "custom": {
            if (item.command) {
              const output = await collectCustom($, item.command, directory)
              debug("custom result", { command: item.command, output })
              if (output) {
                parts.push(formatItem(item, { output }))
              }
            }
            break
          }
        }
      }

      const final = parts.join(config.separator)
      debug("WRITING to statusFile", final)
      writeFileSync(statusFile, final, "utf-8")
      lastWrite = Date.now()
    } catch (err) {
      debug("REFRESH ERROR", String(err))
      try { writeFileSync(statusFile, "", "utf-8") } catch {}
    }
  }

  function scheduleRefresh() {
    debug("scheduleRefresh, statusFile=", statusFile ?? "NULL", "pending=", !!pending)
    if (!statusFile) return
    if (pending) return

    const elapsed = Date.now() - lastWrite
    const delay = Math.max(0, config.refreshInterval - elapsed)

    pending = setTimeout(async () => {
      pending = null
      await refresh()
    }, delay)
  }

  debug("initial refresh")
  await refresh()

  const interval = setInterval(() => {
    debug("periodic tick")
    scheduleRefresh()
  }, config.periodicInterval)

  const cleanup = () => {
    debug("cleanup")
    if (interval) clearInterval(interval)
    if (pending) clearTimeout(pending)
    if (statusFile) {
      try { unlinkSync(statusFile) } catch {}
    }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  debug("plugin init complete, returning hooks")

  return {
    event: async ({ event }) => {
      const e = event as Record<string, unknown>
      const type = typeof e.type === "string" ? e.type : ""
      debug("event", type)
      switch (type) {
        case "session.idle":
        case "session.created":
        case "session.updated":
        case "session.error":
        case "file.edited":
          scheduleRefresh()
          break
      }
    },

    "tool.execute.after": async (input) => {
      const tool = typeof input?.tool === "string" ? input.tool : ""
      debug("tool.execute.after", tool)
      if (["write", "edit", "bash"].includes(tool)) {
        scheduleRefresh()
      }
    },
  }
}

export default StatuslinePlugin