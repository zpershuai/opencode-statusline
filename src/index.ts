/**
 * OpenSpec Statusline Plugin for OpenCode
 *
 * Runs openspec-status.sh on session events and writes the output
 * to /tmp/opencode-pane-status-<TMUX_PANE> so tmux pane-border-format
 * can display per-pane OpenSpec progress.
 *
 * Each tmux pane gets its own status file, so multiple opencode
 * instances in split panes show independent project status.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { writeFileSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const STATUS_SCRIPT =
  process.env.OPENSPEC_STATUS_SCRIPT ??
  join(homedir(), ".claude", "openspec-status.sh")

const STATUS_PREFIX =
  process.env.OPENSPEC_STATUS_PREFIX ??
  "/tmp/opencode-pane-status-"

const MIN_INTERVAL_MS = Number(process.env.OPENSPEC_STATUS_INTERVAL) || 3000
const PERIODIC_MS = Number(process.env.OPENSPEC_STATUS_PERIODIC) || 10_000

function sanitizePane(pane: string): string {
  return pane.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function getStatusFile(): string | null {
  const pane = process.env.TMUX_PANE
  if (!pane) return null
  return `${STATUS_PREFIX}${sanitizePane(pane)}`
}

export const OpenSpecStatuslinePlugin: Plugin = async ({ $, directory }) => {
  const statusFile = getStatusFile()

  let pending: ReturnType<typeof setTimeout> | null = null
  let lastWrite = 0

  async function refresh() {
    if (!statusFile) return

    try {
      const result =
        await $`bash ${STATUS_SCRIPT} --all 2>/dev/null`.cwd(directory).nothrow().quiet()
      const output = (result.stdout?.toString() ?? "").trim()

      const hasActiveChange = output && !output.includes("no active change")
      writeFileSync(statusFile, hasActiveChange ? output : "", "utf-8")
      lastWrite = Date.now()
    } catch {
      try {
        writeFileSync(statusFile, "", "utf-8")
      } catch {}
    }
  }

  function scheduleRefresh() {
    if (!statusFile) return
    if (pending) return

    const elapsed = Date.now() - lastWrite
    const delay = Math.max(0, MIN_INTERVAL_MS - elapsed)

    pending = setTimeout(async () => {
      pending = null
      await refresh()
    }, delay)
  }

  await refresh()

  const interval = setInterval(() => {
    scheduleRefresh()
  }, PERIODIC_MS)

  const cleanup = () => {
    if (interval) clearInterval(interval)
    if (pending) clearTimeout(pending)
    if (statusFile) {
      try {
        unlinkSync(statusFile)
      } catch {}
    }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  return {
    event: async ({ event }) => {
      const e = event as Record<string, unknown>
      const type = typeof e.type === "string" ? e.type : ""

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
      if (["write", "edit", "bash"].includes(tool)) {
        scheduleRefresh()
      }
    },
  }
}