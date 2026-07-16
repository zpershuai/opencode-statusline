import { jsxs as _jsxs, jsx as _jsx } from "@opentui/solid/jsx-runtime";
import { createSignal, For, Show } from "solid-js";
import { exec, execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const DEFAULT_CONFIG = {
    items: [
        { type: "git-branch", format: "🌿 {branch}" },
        { type: "git-diff", format: "📝 +{added} ~{deleted}" },
        { type: "openspec", format: "{status}" },
    ],
    refreshInterval: 500,
    periodicInterval: 3000,
};
const CONFIG_PATHS = [
    join(homedir(), ".config", "opencode", "sidebar.json"),
    // Retain the former configuration file as a migration path.
    join(homedir(), ".config", "opencode", "statusline.json"),
];
function loadConfig() {
    for (const path of CONFIG_PATHS) {
        if (!existsSync(path))
            continue;
        try {
            const parsed = JSON.parse(readFileSync(path, "utf-8"));
            return {
                items: parsed.items ?? DEFAULT_CONFIG.items,
                refreshInterval: parsed.refreshInterval ?? DEFAULT_CONFIG.refreshInterval,
                periodicInterval: Math.max(500, parsed.periodicInterval ?? DEFAULT_CONFIG.periodicInterval),
            };
        }
        catch {
            // Fall back to the defaults when a user configuration is incomplete.
        }
    }
    return DEFAULT_CONFIG;
}
function truncate(value, maxLength) {
    if (maxLength === undefined || value.length <= maxLength)
        return value;
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
function formatItem(item, data) {
    let format = item.format ?? "";
    for (const [key, value] of Object.entries(data)) {
        format = format.replaceAll(`{${key}}`, String(value));
    }
    return truncate(format, item.maxLength);
}
async function commandOutput(command, directory) {
    try {
        const { stdout } = await execAsync(command, { cwd: directory, timeout: 5_000 });
        return stdout.trim();
    }
    catch {
        return "";
    }
}
async function collectItem(item, directory) {
    switch (item.type) {
        case "git-branch": {
            const branch = await commandOutput("git branch --show-current", directory);
            return branch ? { kind: "text", value: formatItem(item, { branch }) } : null;
        }
        case "git-diff": {
            const output = await commandOutput("git diff --numstat", directory);
            let added = 0;
            let deleted = 0;
            for (const line of output.split("\n").filter(Boolean)) {
                const [addedText, deletedText] = line.split("\t");
                added += Number.parseInt(addedText, 10) || 0;
                deleted += Number.parseInt(deletedText, 10) || 0;
            }
            return added || deleted ? { kind: "text", value: formatItem(item, { added, deleted }) } : null;
        }
        case "openspec": {
            try {
                const script = join(__dirname, "..", "scripts", "openspec-status.sh");
                const { stdout } = await execFileAsync("bash", [script], { cwd: directory, timeout: 5_000 });
                const status = stdout.trim();
                if (!status || status.includes("no active change"))
                    return null;
                const parts = formatItem(item, { status }).split("│").map((part) => part.trim()).filter(Boolean);
                return { kind: "openspec", title: parts[0], details: parts.slice(1) };
            }
            catch {
                return null;
            }
        }
        case "custom": {
            const output = item.command ? await commandOutput(item.command, directory) : "";
            return output ? { kind: "text", value: formatItem(item, { output }) } : null;
        }
    }
}
function OpenSpecItem(props) {
    const [expanded, setExpanded] = createSignal(false);
    const toggle = () => setExpanded((value) => !value);
    return (_jsxs("box", { flexDirection: "column", children: [_jsxs("text", { fg: props.context.theme.current.primary, onMouseUp: toggle, children: [expanded() ? "▼" : "▶", " ", props.item.title] }), _jsx(Show, { when: expanded() && props.item.details.length > 0, children: _jsx("box", { flexDirection: "column", paddingLeft: 1, children: _jsx(For, { each: props.item.details, children: (detail) => _jsx("text", { fg: props.context.theme.current.textMuted, children: detail }) }) }) })] }));
}
function SidebarPanel(props) {
    const [expanded, setExpanded] = createSignal(props.api.kv.get("opencode-statusline.sidebar.expanded", true));
    const toggle = () => {
        const next = !expanded();
        setExpanded(next);
        props.api.kv.set("opencode-statusline.sidebar.expanded", next);
    };
    const sessionStatus = () => {
        props.revision();
        return props.api.state.session.status(props.sessionID)?.type ?? "idle";
    };
    const todos = () => {
        props.revision();
        return props.api.state.session.todo(props.sessionID);
    };
    const completedTodos = () => todos().filter((todo) => todo.status === "completed").length;
    return (_jsxs("box", { flexDirection: "column", borderStyle: "rounded", borderColor: props.context.theme.current.border, paddingLeft: 1, paddingRight: 1, children: [_jsx("text", { fg: props.context.theme.current.primary, onMouseUp: toggle, children: _jsxs("b", { children: [expanded() ? "▼" : "▶", " Status \u00B7 ", basename(props.api.state.path.directory)] }) }), _jsx(Show, { when: expanded(), children: _jsxs("box", { flexDirection: "column", children: [_jsxs("text", { fg: sessionStatus() === "busy" ? props.context.theme.current.warning : props.context.theme.current.textMuted, children: ["\u25CF Session ", sessionStatus()] }), _jsx(For, { each: props.panel().items, children: (item) => item.kind === "openspec"
                                ? _jsx(OpenSpecItem, { item: item, context: props.context })
                                : _jsx("text", { children: item.value }) }), _jsx(Show, { when: todos().length > 0, children: _jsxs("text", { fg: props.context.theme.current.textMuted, children: ["\u2713 Tasks ", completedTodos(), "/", todos().length] }) }), _jsxs("text", { fg: props.context.theme.current.textMuted, onMouseUp: props.refresh, children: ["\u21BB Refresh ", props.panel().updatedAt?.toLocaleTimeString() ?? "…"] })] }) })] }));
}
function createSidebar(api, config) {
    const [panel, setPanel] = createSignal({ items: [] });
    const [revision, setRevision] = createSignal(0);
    let pending;
    let refreshing = false;
    const refresh = async () => {
        if (refreshing)
            return;
        refreshing = true;
        try {
            const items = (await Promise.all(config.items.map((item) => collectItem(item, api.state.path.directory))))
                .filter((item) => item !== null);
            setPanel({ items, updatedAt: new Date() });
        }
        finally {
            refreshing = false;
            setRevision((value) => value + 1);
        }
    };
    const scheduleRefresh = () => {
        if (pending)
            return;
        pending = setTimeout(() => {
            pending = undefined;
            void refresh();
        }, config.refreshInterval);
    };
    const unsubscribers = [
        api.event.on("message.part.updated", scheduleRefresh),
        api.event.on("todo.updated", scheduleRefresh),
        api.event.on("session.updated", scheduleRefresh),
        api.event.on("session.idle", scheduleRefresh),
        api.event.on("file.edited", scheduleRefresh),
        api.event.on("vcs.branch.updated", scheduleRefresh),
    ];
    const interval = setInterval(scheduleRefresh, config.periodicInterval);
    api.lifecycle.onDispose(() => {
        if (pending)
            clearTimeout(pending);
        clearInterval(interval);
        unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
    void refresh();
    return {
        order: 60,
        slots: {
            sidebar_content(context, input) {
                return _jsx(SidebarPanel, { api: api, context: context, sessionID: input.session_id, panel: panel, refresh: scheduleRefresh, revision: revision });
            },
        },
    };
}
const tui = async (api) => {
    api.slots.register(createSidebar(api, loadConfig()));
};
export default { id: "opencode-statusline", tui };
