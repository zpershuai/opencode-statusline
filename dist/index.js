// @bun
// src/index.tsx
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";
import { exec, execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { promisify } from "util";
var __dirname2 = dirname(fileURLToPath(import.meta.url));
var execFileAsync = promisify(execFile);
var execAsync = promisify(exec);
var DEFAULT_CONFIG = {
  items: [{
    type: "git-branch",
    format: "\uD83C\uDF3F {branch}"
  }, {
    type: "git-diff",
    format: "\uD83D\uDCDD +{added} ~{deleted}"
  }, {
    type: "openspec",
    format: "{status}"
  }],
  refreshInterval: 500,
  periodicInterval: 3000
};
var CONFIG_PATHS = [
  join(homedir(), ".config", "opencode", "sidebar.json"),
  join(homedir(), ".config", "opencode", "statusline.json")
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
        periodicInterval: Math.max(500, parsed.periodicInterval ?? DEFAULT_CONFIG.periodicInterval)
      };
    } catch {}
  }
  return DEFAULT_CONFIG;
}
function truncate(value, maxLength) {
  if (maxLength === undefined || value.length <= maxLength)
    return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}\u2026`;
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
    const {
      stdout
    } = await execAsync(command, {
      cwd: directory,
      timeout: 5000
    });
    return stdout.trim();
  } catch {
    return "";
  }
}
async function collectItem(item, directory) {
  switch (item.type) {
    case "git-branch": {
      const branch = await commandOutput("git branch --show-current", directory);
      return branch ? [{
        kind: "text",
        value: formatItem(item, {
          branch
        })
      }] : [];
    }
    case "git-diff": {
      const output = await commandOutput("git diff --numstat", directory);
      let added = 0;
      let deleted = 0;
      for (const line of output.split(`
`).filter(Boolean)) {
        const [addedText, deletedText] = line.split("\t");
        added += Number.parseInt(addedText, 10) || 0;
        deleted += Number.parseInt(deletedText, 10) || 0;
      }
      return added || deleted ? [{
        kind: "text",
        value: formatItem(item, {
          added,
          deleted
        })
      }] : [];
    }
    case "openspec": {
      try {
        const script = join(__dirname2, "..", "scripts", "openspec-status.sh");
        const {
          stdout
        } = await execFileAsync("bash", [script, "--all"], {
          cwd: directory,
          timeout: 5000
        });
        const lines = stdout.trim().split(`
`).map((line) => line.trim()).filter((line) => line && !line.includes("no active change"));
        if (lines.length === 0)
          return [];
        return lines.map((status) => {
          const parts = formatItem(item, {
            status
          }).split("\u2502").map((part) => part.trim()).filter(Boolean);
          return {
            kind: "openspec",
            title: parts[0],
            details: parts.slice(1)
          };
        });
      } catch {
        return [];
      }
    }
    case "custom": {
      const output = item.command ? await commandOutput(item.command, directory) : "";
      return output ? [{
        kind: "text",
        value: formatItem(item, {
          output
        })
      }] : [];
    }
  }
}
function CollapseHeader(props) {
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$3 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "gap", 1);
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "onMouseDown", (event) => {
      event?.stopPropagation?.();
      props.onToggle();
    });
    _$setProp(_el$2, "selectable", false);
    _$insert(_el$2, () => props.expanded() ? "\u25BC" : "\u25B6");
    _$setProp(_el$3, "selectable", false);
    _$insert(_el$3, (() => {
      var _c$ = _$memo(() => !!props.bold);
      return () => _c$() ? (() => {
        var _el$4 = _$createElement("b");
        _$insert(_el$4, () => props.label);
        return _el$4;
      })() : props.label;
    })());
    _$effect((_p$) => {
      var { color: _v$, color: _v$2 } = props;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function OpenSpecItem(props) {
  return (() => {
    var _el$5 = _$createElement("box");
    _$setProp(_el$5, "flexDirection", "column");
    _$setProp(_el$5, "width", "100%");
    _$insert(_el$5, _$createComponent(CollapseHeader, {
      get expanded() {
        return props.expanded;
      },
      get label() {
        return props.item.title;
      },
      get color() {
        return props.context.theme.current.primary;
      },
      get onToggle() {
        return props.onToggle;
      }
    }), null);
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!props.expanded())() && props.item.details.length > 0;
      },
      get children() {
        var _el$6 = _$createElement("box");
        _$setProp(_el$6, "flexDirection", "column");
        _$setProp(_el$6, "paddingLeft", 1);
        _$setProp(_el$6, "width", "100%");
        _$insert(_el$6, _$createComponent(For, {
          get each() {
            return props.item.details;
          },
          children: (detail) => (() => {
            var _el$7 = _$createElement("text");
            _$insert(_el$7, detail);
            _$effect((_$p) => _$setProp(_el$7, "fg", props.context.theme.current.textMuted, _$p));
            return _el$7;
          })()
        }));
        return _el$6;
      }
    }), null);
    return _el$5;
  })();
}
function SidebarPanel(props) {
  const sessionStatus = () => {
    props.revision();
    return props.api.state.session.status(props.sessionID)?.type ?? "idle";
  };
  const todos = () => {
    props.revision();
    return props.api.state.session.todo(props.sessionID);
  };
  const completedTodos = () => todos().filter((todo) => todo.status === "completed").length;
  return (() => {
    var _el$8 = _$createElement("box");
    _$setProp(_el$8, "flexDirection", "column");
    _$setProp(_el$8, "width", "100%");
    _$setProp(_el$8, "borderStyle", "rounded");
    _$setProp(_el$8, "paddingLeft", 1);
    _$setProp(_el$8, "paddingRight", 1);
    _$insert(_el$8, _$createComponent(CollapseHeader, {
      get expanded() {
        return props.sidebarExpanded;
      },
      get label() {
        return `Status \xB7 ${basename(props.api.state.path.directory)}`;
      },
      get color() {
        return props.context.theme.current.primary;
      },
      bold: true,
      get onToggle() {
        return props.toggleSidebar;
      }
    }), null);
    _$insert(_el$8, _$createComponent(Show, {
      get when() {
        return props.sidebarExpanded();
      },
      get children() {
        var _el$9 = _$createElement("box"), _el$0 = _$createElement("text"), _el$1 = _$createTextNode(`\u25CF Session `), _el$13 = _$createElement("box"), _el$14 = _$createElement("text"), _el$15 = _$createTextNode(`\u21BB Refresh `);
        _$insertNode(_el$9, _el$0);
        _$insertNode(_el$9, _el$13);
        _$setProp(_el$9, "flexDirection", "column");
        _$setProp(_el$9, "width", "100%");
        _$insertNode(_el$0, _el$1);
        _$insert(_el$0, sessionStatus, null);
        _$insert(_el$9, _$createComponent(For, {
          get each() {
            return props.panel().items;
          },
          children: (item) => item.kind === "openspec" ? _$createComponent(OpenSpecItem, {
            item,
            get context() {
              return props.context;
            },
            expanded: () => props.isOpenSpecExpanded(item.title),
            onToggle: () => props.toggleOpenSpec(item.title)
          }) : (() => {
            var _el$16 = _$createElement("text");
            _$insert(_el$16, () => item.value);
            return _el$16;
          })()
        }), _el$13);
        _$insert(_el$9, _$createComponent(Show, {
          get when() {
            return todos().length > 0;
          },
          get children() {
            var _el$10 = _$createElement("text"), _el$11 = _$createTextNode(`\u2713 Tasks `), _el$12 = _$createTextNode(`/`);
            _$insertNode(_el$10, _el$11);
            _$insertNode(_el$10, _el$12);
            _$insert(_el$10, completedTodos, _el$12);
            _$insert(_el$10, () => todos().length, null);
            _$effect((_$p) => _$setProp(_el$10, "fg", props.context.theme.current.textMuted, _$p));
            return _el$10;
          }
        }), _el$13);
        _$insertNode(_el$13, _el$14);
        _$setProp(_el$13, "width", "100%");
        _$setProp(_el$13, "onMouseDown", (event) => {
          event?.stopPropagation?.();
          props.refresh();
        });
        _$insertNode(_el$14, _el$15);
        _$setProp(_el$14, "selectable", false);
        _$insert(_el$14, () => props.panel().updatedAt?.toLocaleTimeString() ?? "\u2026", null);
        _$effect((_p$) => {
          var _v$3 = sessionStatus() === "busy" ? props.context.theme.current.warning : props.context.theme.current.textMuted, _v$4 = props.context.theme.current.textMuted;
          _v$3 !== _p$.e && (_p$.e = _$setProp(_el$0, "fg", _v$3, _p$.e));
          _v$4 !== _p$.t && (_p$.t = _$setProp(_el$14, "fg", _v$4, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$9;
      }
    }), null);
    _$effect((_$p) => _$setProp(_el$8, "borderColor", props.context.theme.current.border, _$p));
    return _el$8;
  })();
}
function createSidebar(api, config) {
  const [panel, setPanel] = createSignal({
    items: []
  });
  const [revision, setRevision] = createSignal(0);
  const [sidebarExpanded, setSidebarExpanded] = createSignal(api.kv.get("opencode-statusline.sidebar.expanded", true));
  const [openSpecExpanded, setOpenSpecExpanded] = createSignal(api.kv.get("opencode-statusline.openspec.expanded", {}));
  let pending;
  let refreshing = false;
  const toggleSidebar = () => {
    const next = !sidebarExpanded();
    setSidebarExpanded(next);
    api.kv.set("opencode-statusline.sidebar.expanded", next);
  };
  const isOpenSpecExpanded = (title) => openSpecExpanded()[title] === true;
  const toggleOpenSpec = (title) => {
    const next = {
      ...openSpecExpanded(),
      [title]: !isOpenSpecExpanded(title)
    };
    setOpenSpecExpanded(next);
    api.kv.set("opencode-statusline.openspec.expanded", next);
  };
  const refresh = async () => {
    if (refreshing)
      return;
    refreshing = true;
    try {
      const items = (await Promise.all(config.items.map((item) => collectItem(item, api.state.path.directory)))).flat();
      setPanel({
        items,
        updatedAt: new Date
      });
    } finally {
      refreshing = false;
      setRevision((value) => value + 1);
    }
  };
  const scheduleRefresh = () => {
    if (pending)
      return;
    pending = setTimeout(() => {
      pending = undefined;
      refresh();
    }, config.refreshInterval);
  };
  const unsubscribers = [api.event.on("message.part.updated", scheduleRefresh), api.event.on("todo.updated", scheduleRefresh), api.event.on("session.updated", scheduleRefresh), api.event.on("session.idle", scheduleRefresh), api.event.on("file.edited", scheduleRefresh), api.event.on("vcs.branch.updated", scheduleRefresh)];
  const interval = setInterval(scheduleRefresh, config.periodicInterval);
  api.lifecycle.onDispose(() => {
    if (pending)
      clearTimeout(pending);
    clearInterval(interval);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });
  refresh();
  return {
    order: 60,
    slots: {
      sidebar_content(context, input) {
        return _$createComponent(SidebarPanel, {
          api,
          context,
          get sessionID() {
            return input.session_id;
          },
          panel,
          refresh: scheduleRefresh,
          revision,
          sidebarExpanded,
          toggleSidebar,
          isOpenSpecExpanded,
          toggleOpenSpec
        });
      }
    }
  };
}
var tui = async (api) => {
  api.slots.register(createSidebar(api, loadConfig()));
};
var src_default = {
  id: "opencode-statusline",
  tui
};
export {
  src_default as default
};
