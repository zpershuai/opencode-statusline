# openspec-statusline

OpenCode plugin that displays OpenSpec progress in tmux pane borders.

## How it works

The plugin runs `openspec-status.sh` periodically and on session events, writing the output to `/tmp/opencode-pane-status-<TMUX_PANE>`. Each tmux pane gets its own status file, so multiple opencode instances show independent project status.

## Installation

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": ["opencode-openspec-statusline@latest"]
}
```

Or from GitHub:

```jsonc
{
  "plugin": ["github:zpershuai/openspec-statusline"]
}
```

## tmux setup

Add this to your `tmux.conf`:

```
set -g pane-border-format '#{pane_current_command} #(cat /tmp/opencode-pane-status-#{pane_id} 2>/dev/null)'
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `OPENSPEC_STATUS_SCRIPT` | `~/.claude/openspec-status.sh` | Path to the status script |
| `OPENSPEC_STATUS_PREFIX` | `/tmp/opencode-pane-status-` | Prefix for status files |
| `OPENSPEC_STATUS_INTERVAL` | `3000` | Debounce interval in ms |
| `OPENSPEC_STATUS_PERIODIC` | `10000` | Periodic refresh interval in ms |

## License

MIT