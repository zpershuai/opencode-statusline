/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginApi, TuiSlotContext, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import { exec, execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const __dirname = dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

interface StatusItem {
  type: "git-branch" | "git-diff" | "openspec" | "custom"
  format?: string
  command?: string
  maxLength?: number
}

interface PluginConfig {
  items: StatusItem[]
  refreshInterval: number
  periodicInterval: number
}

interface PanelState {
  items: PanelItem[]
  updatedAt?: Date
}

interface TextPanelItem {
  kind: "text"
  value: string
}

interface OpenSpecPanelItem {
  kind: "openspec"
  title: string
  details: string[]
}

type PanelItem = TextPanelItem | OpenSpecPanelItem

const DEFAULT_CONFIG: PluginConfig = {
  items: [
    { type: "git-branch", format: "🌿 {branch}" },
    { type: "git-diff", format: "📝 +{added} ~{deleted}" },
    { type: "openspec", format: "{status}" },
  ],
  refreshInterval: 500,
  periodicInterval: 3000,
}

const CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "sidebar.json"),
  // Retain the former configuration file as a migration path.
  join(homedir(), ".config", "opencode", "statusline.json"),
]

function loadConfig(): PluginConfig {
  for (const path of CONFIG_PATHS) {
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<PluginConfig>
      return {
        items: parsed.items ?? DEFAULT_CONFIG.items,
        refreshInterval: parsed.refreshInterval ?? DEFAULT_CONFIG.refreshInterval,
        periodicInterval: Math.max(500, parsed.periodicInterval ?? DEFAULT_CONFIG.periodicInterval),
      }
    } catch {
      // Fall back to the defaults when a user configuration is incomplete.
    }
  }
  return DEFAULT_CONFIG
}

function truncate(value: string, maxLength?: number): string {
  if (maxLength === undefined || value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function formatItem(item: StatusItem, data: Record<string, string | number>): string {
  let format = item.format ?? ""
  for (const [key, value] of Object.entries(data)) {
    format = format.replaceAll(`{${key}}`, String(value))
  }
  return truncate(format, item.maxLength)
}

async function commandOutput(command: string, directory: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, { cwd: directory, timeout: 5_000 })
    return stdout.trim()
  } catch {
    return ""
  }
}

async function collectItem(item: StatusItem, directory: string): Promise<PanelItem | null> {
  switch (item.type) {
    case "git-branch": {
      const branch = await commandOutput("git branch --show-current", directory)
      return branch ? { kind: "text", value: formatItem(item, { branch }) } : null
    }
    case "git-diff": {
      const output = await commandOutput("git diff --numstat", directory)
      let added = 0
      let deleted = 0
      for (const line of output.split("\n").filter(Boolean)) {
        const [addedText, deletedText] = line.split("\t")
        added += Number.parseInt(addedText, 10) || 0
        deleted += Number.parseInt(deletedText, 10) || 0
      }
      return added || deleted ? { kind: "text", value: formatItem(item, { added, deleted }) } : null
    }
    case "openspec": {
      try {
        const script = join(__dirname, "..", "scripts", "openspec-status.sh")
        const { stdout } = await execFileAsync("bash", [script], { cwd: directory, timeout: 5_000 })
        const status = stdout.trim()
        if (!status || status.includes("no active change")) return null
        const parts = formatItem(item, { status }).split("│").map((part) => part.trim()).filter(Boolean)
        return { kind: "openspec", title: parts[0], details: parts.slice(1) }
      } catch {
        return null
      }
    }
    case "custom": {
      const output = item.command ? await commandOutput(item.command, directory) : ""
      return output ? { kind: "text", value: formatItem(item, { output }) } : null
    }
  }
}

// Match OpenCode built-in sidebar collapse rows: row box + onMouseDown + stopPropagation.
function CollapseHeader(props: {
  expanded: () => boolean
  label: string
  color: any
  bold?: boolean
  onToggle: () => void
}) {
  return (
    <box
      flexDirection="row"
      gap={1}
      width="100%"
      onMouseDown={(event: any) => {
        event?.stopPropagation?.()
        props.onToggle()
      }}
    >
      <text fg={props.color} selectable={false}>
        {props.expanded() ? "▼" : "▶"}
      </text>
      <text fg={props.color} selectable={false}>
        {props.bold ? <b>{props.label}</b> : props.label}
      </text>
    </box>
  )
}

function OpenSpecItem(props: {
  item: OpenSpecPanelItem
  context: TuiSlotContext
  expanded: () => boolean
  onToggle: () => void
}) {
  return (
    <box flexDirection="column" width="100%">
      <CollapseHeader
        expanded={props.expanded}
        label={props.item.title}
        color={props.context.theme.current.primary}
        onToggle={props.onToggle}
      />
      <Show when={props.expanded() && props.item.details.length > 0}>
        <box flexDirection="column" paddingLeft={1} width="100%">
          <For each={props.item.details}>
            {(detail) => <text fg={props.context.theme.current.textMuted}>{detail}</text>}
          </For>
        </box>
      </Show>
    </box>
  )
}

function SidebarPanel(props: {
  api: TuiPluginApi
  context: TuiSlotContext
  sessionID: string
  panel: () => PanelState
  refresh: () => void
  revision: () => number
  sidebarExpanded: () => boolean
  toggleSidebar: () => void
  isOpenSpecExpanded: (title: string) => boolean
  toggleOpenSpec: (title: string) => void
}) {
  const sessionStatus = () => {
    props.revision()
    return props.api.state.session.status(props.sessionID)?.type ?? "idle"
  }
  const todos = () => {
    props.revision()
    return props.api.state.session.todo(props.sessionID)
  }
  const completedTodos = () => todos().filter((todo) => todo.status === "completed").length

  return (
    <box
      flexDirection="column"
      width="100%"
      borderStyle="rounded"
      borderColor={props.context.theme.current.border}
      paddingLeft={1}
      paddingRight={1}
    >
      <CollapseHeader
        expanded={props.sidebarExpanded}
        label={`Status · ${basename(props.api.state.path.directory)}`}
        color={props.context.theme.current.primary}
        bold
        onToggle={props.toggleSidebar}
      />
      <Show when={props.sidebarExpanded()}>
        <box flexDirection="column" width="100%">
          <text fg={sessionStatus() === "busy" ? props.context.theme.current.warning : props.context.theme.current.textMuted}>
            ● Session {sessionStatus()}
          </text>
          <For each={props.panel().items}>
            {(item) =>
              item.kind === "openspec" ? (
                <OpenSpecItem
                  item={item}
                  context={props.context}
                  expanded={() => props.isOpenSpecExpanded(item.title)}
                  onToggle={() => props.toggleOpenSpec(item.title)}
                />
              ) : (
                <text>{item.value}</text>
              )
            }
          </For>
          <Show when={todos().length > 0}>
            <text fg={props.context.theme.current.textMuted}>
              ✓ Tasks {completedTodos()}/{todos().length}
            </text>
          </Show>
          <box
            width="100%"
            onMouseDown={(event: any) => {
              event?.stopPropagation?.()
              props.refresh()
            }}
          >
            <text fg={props.context.theme.current.textMuted} selectable={false}>
              ↻ Refresh {props.panel().updatedAt?.toLocaleTimeString() ?? "…"}
            </text>
          </box>
        </box>
      </Show>
    </box>
  )
}

function createSidebar(api: TuiPluginApi, config: PluginConfig): TuiSlotPlugin {
  const [panel, setPanel] = createSignal<PanelState>({ items: [] })
  const [revision, setRevision] = createSignal(0)
  // Lifted state survives SidebarPanel remounts from slot re-render.
  const [sidebarExpanded, setSidebarExpanded] = createSignal(api.kv.get("opencode-statusline.sidebar.expanded", true))
  const [openSpecExpanded, setOpenSpecExpanded] = createSignal<Record<string, boolean>>(
    api.kv.get("opencode-statusline.openspec.expanded", {}),
  )
  let pending: ReturnType<typeof setTimeout> | undefined
  let refreshing = false

  const toggleSidebar = () => {
    const next = !sidebarExpanded()
    setSidebarExpanded(next)
    api.kv.set("opencode-statusline.sidebar.expanded", next)
  }

  const isOpenSpecExpanded = (title: string) => openSpecExpanded()[title] === true
  const toggleOpenSpec = (title: string) => {
    const next = { ...openSpecExpanded(), [title]: !isOpenSpecExpanded(title) }
    setOpenSpecExpanded(next)
    api.kv.set("opencode-statusline.openspec.expanded", next)
  }

  const refresh = async () => {
    if (refreshing) return
    refreshing = true
    try {
      const items = (await Promise.all(config.items.map((item) => collectItem(item, api.state.path.directory))))
        .filter((item): item is PanelItem => item !== null)
      setPanel({ items, updatedAt: new Date() })
    } finally {
      refreshing = false
      setRevision((value) => value + 1)
    }
  }

  const scheduleRefresh = () => {
    if (pending) return
    pending = setTimeout(() => {
      pending = undefined
      void refresh()
    }, config.refreshInterval)
  }

  const unsubscribers = [
    api.event.on("message.part.updated", scheduleRefresh),
    api.event.on("todo.updated", scheduleRefresh),
    api.event.on("session.updated", scheduleRefresh),
    api.event.on("session.idle", scheduleRefresh),
    api.event.on("file.edited", scheduleRefresh),
    api.event.on("vcs.branch.updated", scheduleRefresh),
  ]
  const interval = setInterval(scheduleRefresh, config.periodicInterval)
  api.lifecycle.onDispose(() => {
    if (pending) clearTimeout(pending)
    clearInterval(interval)
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  })
  void refresh()

  return {
    order: 60,
    slots: {
      sidebar_content(context, input) {
        return (
          <SidebarPanel
            api={api}
            context={context}
            sessionID={input.session_id}
            panel={panel}
            refresh={scheduleRefresh}
            revision={revision}
            sidebarExpanded={sidebarExpanded}
            toggleSidebar={toggleSidebar}
            isOpenSpecExpanded={isOpenSpecExpanded}
            toggleOpenSpec={toggleOpenSpec}
          />
        )
      },
    },
  }
}

const tui: TuiPlugin = async (api) => {
  api.slots.register(createSidebar(api, loadConfig()))
}

export default { id: "opencode-statusline", tui }
