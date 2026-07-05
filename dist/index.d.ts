/**
 * OpenCode Statusline Plugin
 *
 * Collects configurable status items (git branch, changed lines, openspec progress, etc.)
 * and writes the output to a tmux pane status file.
 *
 * Each tmux pane gets its own status file, so multiple opencode
 * instances in split panes show independent project status.
 */
import type { Plugin } from "@opencode-ai/plugin";
export declare const StatuslinePlugin: Plugin;
export default StatuslinePlugin;
