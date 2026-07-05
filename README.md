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
set -g pane-border-status bottom
```

`pane-border-status` must be set to `top` or `bottom`; otherwise the border text is not rendered even though `pane-border-format` is configured.

## Environment variables

| variable | default | description |
|---|---|---|
| `OPENCODE_STATUS_PREFIX` | `/tmp/opencode-pane-status-` | Prefix for status files |
| `OPENCODE_STATUS_DEBUG` | unset | Set to `1` to write debug logs to `/tmp/opencode-statusline-debug.log` |

## Troubleshooting

### No `/tmp/opencode-pane-status-*` files are created

1. Verify the plugin is loaded: `opencode debug info` should list `opencode-statusline`.
2. Restart OpenCode inside a tmux pane so that `TMUX_PANE` is available to the plugin process.
3. Check the always-on boot log at `/tmp/opencode-statusline-boot.log` and enable debug logging with `OPENCODE_STATUS_DEBUG=1`.

### Status files exist but nothing appears in tmux

- Make sure `pane-border-status` is set to `top` or `bottom` (not `off`).
- Confirm the option is actually loaded: `tmux show-options -g pane-border-status`.
- The plugin writes files named after `#{pane_id}` (e.g. `/tmp/opencode-pane-status-%0`), so the filename must keep the `%` character. Older versions sanitized `%` to `_`, which caused a mismatch with tmux.

## License

MIT