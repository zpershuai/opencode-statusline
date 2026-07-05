# opencode-statusline

OpenCode plugin that displays configurable status items in tmux pane borders.

## Features

- **git-branch** — current branch name
- **git-diff** — added/deleted lines in unstaged changes
- **openspec** — OpenSpec progress (runs bundled `openspec-status.sh`)
- **custom** — arbitrary shell commands
- Fully configurable via `~/.config/opencode/statusline.json`

## Installation

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-statusline@latest"]
}
```

Or from GitHub:

```jsonc
{
  "plugin": ["github:zpershuai/opencode-statusline"]
}
```

## Configuration

Create `~/.config/opencode/statusline.json`:

```json
{
  "items": [
    { "type": "git-branch", "format": " {branch}" },
    { "type": "git-diff", "format": "+{added}~{deleted}" },
    { "type": "openspec", "format": "{status}" },
    { "type": "custom", "command": "date '+%H:%M'", "format": "🕐 {output}" }
  ],
  "separator": " │ ",
  "refreshInterval": 3000,
  "periodicInterval": 10000
}
```

### Status items

| type | description | default format |
|---|---|---|
| `git-branch` | Current git branch | ` {branch}` |
| `git-diff` | Unstaged added/deleted lines | `+{added}~{deleted}` |
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