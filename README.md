# opencode-statusline

OpenCode plugin that displays configurable status items in tmux pane borders.

```
📁 opencode │ 🌿 main │ 📝 +42 ~17 │ 📘 add-auth │ 🧩 A:3/5 ✔3 │ ✅ Tasks 5/7 [████░░░] 71%
```

## Installation

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-statusline@latest"]
}
```

## Configuration

Create `~/.config/opencode/statusline.json`:

```json
{
  "items": [
    { "type": "custom", "command": "basename \"$(pwd)\"", "format": "📁 {output}" },
    { "type": "git-branch", "format": "🌿 {branch}" },
    { "type": "git-diff", "format": "📝 +{added} ~{deleted}" },
    { "type": "openspec", "format": "{status}" }
  ],
  "separator": " │ ",
  "refreshInterval": 3000,
  "periodicInterval": 10000
}
```

### Status items

| type | description | format placeholders |
|---|---|---|
| `git-branch` | Current git branch | `{branch}` |
| `git-diff` | Unstaged added/deleted lines | `{added}`, `{deleted}` |
| `openspec` | OpenSpec change progress | `{status}` |
| `custom` | Arbitrary shell command | `{output}` |

Each item supports `format` (template with `{key}` placeholders) and `maxLength` (truncation).

### Options

| option | default | description |
|---|---|---|
| `separator` | `" │ "` | Separator between status items |
| `refreshInterval` | `3000` | Debounce interval in ms |
| `periodicInterval` | `10000` | Periodic refresh interval in ms |

## tmux setup

Add to `tmux.conf`:

```
set -g pane-border-format '#{pane_current_command} #(cat /tmp/opencode-pane-status-#{pane_id} 2>/dev/null)'
```

## Environment variables

| variable | default | description |
|---|---|---|
| `OPENCODE_STATUS_PREFIX` | `/tmp/opencode-pane-status-` | Prefix for status files |

## License

MIT