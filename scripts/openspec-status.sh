#!/usr/bin/env bash
# Pretty OpenSpec statusline for tmux / shell / editor
# Bundled with opencode-statusline plugin

SHOW_ALL=0
if [ "${1:-}" = "--all" ]; then
  SHOW_ALL=1
  shift
fi

CHANGE="${1:-}"
LIST_JSON=""
OPENSPEC=(env OPENSPEC_TELEMETRY=0 openspec)

get_list_json() {
  if [ -n "$LIST_JSON" ]; then
    printf "%s\n" "$LIST_JSON"
    return
  fi
  LIST_JSON="$("${OPENSPEC[@]}" list --json 2>/dev/null)"
  printf "%s\n" "$LIST_JSON"
}

get_change_names() {
  local names
  names="$(get_list_json | jq -r '
    def to_name:
      if type == "object" then .name // empty else . end;
    if type == "array" then
      .[] | to_name
    elif type == "object" then
      ((.changes // .items // .data // [])[] | to_name)
    else
      empty
    end
  ' 2>/dev/null)"

  if [ -n "$names" ]; then
    printf "%s\n" "$names"
    return
  fi

  "${OPENSPEC[@]}" list 2>/dev/null \
    | awk '/^Changes:/{in_changes=1; next} in_changes && /^[[:space:]]+[[:alnum:]_-]+/{print $1}'
}

get_task_progress() {
  local change="$1"
  local progress done total status

  progress="$(get_list_json | jq -r --arg c "$change" '
    def items:
      if type == "array" then .
      elif type == "object" then (.changes // .items // .data // [])
      else []
      end;
    items
    | map(select((if type=="object" then .name else . end) == $c))[0] // empty
    | if type=="object" then
        "\(.completedTasks // 0) \(.totalTasks // 0) \(.status // "")"
      else
        empty
      end
  ' 2>/dev/null)"

  if [ -n "$progress" ]; then
    printf "%s\n" "$progress"
    return
  fi

  local task_file="changes/$change/tasks.md"
  done=0
  total=0
  status=""
  if [ -f "$task_file" ]; then
    done=$(grep -Eic "\[[xX]\]" "$task_file" 2>/dev/null || echo 0)
    total=$(grep -Ec "\[[ xX]\]" "$task_file" 2>/dev/null || echo 0)
    if [ "$total" -gt 0 ] && [ "$done" -ge "$total" ]; then
      status="complete"
    fi
  fi
  printf "%s %s %s\n" "$done" "$total" "$status"
}

progress_bar() {
  local done=$1
  local total=$2
  local width=${3:-8}
  if [ "$total" -le 0 ]; then
    printf "[--------]"
    return
  fi
  local filled=$(( done * width / total ))
  local empty=$(( width - filled ))

  printf "["
  for ((i=0; i<filled; i++)); do printf "█"; done
  for ((i=0; i<empty; i++)); do printf "░"; done
  printf "]"
}

render_change_status() {
  local change="$1"
  local status_json done ready blocked total
  local progress task_done task_total task_status bar pct implementation task_icon
  local art_summary

  progress="$(get_task_progress "$change")"
  task_done="$(echo "$progress" | awk '{print $1}')"
  task_total="$(echo "$progress" | awk '{print $2}')"
  task_status="$(echo "$progress" | awk '{print $3}')"

  status_json="$("${OPENSPEC[@]}" status --change "$change" --json 2>/dev/null)"
  if [ -z "$status_json" ]; then
    echo "📘 $change | OpenSpec status error"
    return
  fi

  done=$(echo "$status_json"    | jq '[.artifacts[]? | select(.status=="done")]   | length' 2>/dev/null)
  ready=$(echo "$status_json"   | jq '[.artifacts[]? | select(.status=="ready")]  | length' 2>/dev/null)
  blocked=$(echo "$status_json" | jq '[.artifacts[]? | select(.status=="blocked")]| length' 2>/dev/null)
  total=$(echo "$status_json"   | jq '.artifacts | length' 2>/dev/null)

  art_summary="🧩 A:${done}/${total} ✔${done}"
  if [ "$ready" -gt 0 ]; then
    art_summary="$art_summary ●${ready}"
  fi
  if [ "$blocked" -gt 0 ]; then
    art_summary="$art_summary ○${blocked}"
  fi

  if [ "$task_total" -gt 0 ]; then
    bar="$(progress_bar "$task_done" "$task_total" 8)"
    pct=$(( task_done * 100 / task_total ))
    if [ "$task_done" -ge "$task_total" ] || [ "$task_status" = "complete" ]; then
      task_icon="✅"
    else
      task_icon="🚧"
    fi
    implementation="$task_icon Tasks ${task_done}/${task_total} $bar ${pct}%"
  else
    implementation="📝 Tasks — [--------]"
  fi

  echo "📘 $change │ $art_summary │ $implementation"
}

# Select change
if [ -z "$CHANGE" ]; then
  if [ -f ".openspec.yaml" ] || [[ "$PWD" == *"/changes/"* ]]; then
    if [[ "$PWD" == *"/changes/"* ]]; then
      CHANGE="$(basename "$PWD")"
    else
      if [ -d "changes" ]; then
        CHANGE="$(ls -1t changes 2>/dev/null | head -n1)"
      fi
    fi
  fi
fi

if [ -z "$CHANGE" ]; then
  CHANGE="$(get_change_names | head -n1)"
fi

if [ -z "$CHANGE" ]; then
  echo "📘 OpenSpec: no active change"
  exit 0
fi

if [ "$SHOW_ALL" -eq 1 ]; then
  get_change_names | while IFS= read -r change; do
    [ -z "$change" ] && continue
    render_change_status "$change"
  done
  exit 0
fi

render_change_status "$CHANGE"