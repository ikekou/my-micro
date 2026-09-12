#!/bin/sh
# Resolve a supported Node runtime without relying on a user-specific absolute path.
set -eu
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
valid_node() {
  [ -x "$1" ] && "$1" -e 'if(Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' >/dev/null 2>&1
}
runtime=''
if [ -n "${MY_MICRO_NODE:-}" ]; then
  if valid_node "$MY_MICRO_NODE"; then runtime=$MY_MICRO_NODE; fi
else
  candidate=$(command -v node 2>/dev/null || true)
  if [ -n "$candidate" ] && valid_node "$candidate"; then runtime=$candidate; fi
  if [ -z "$runtime" ]; then
    for app in "${MY_MICRO_CODEX_APP:-/nonexistent}" /Applications/Codex.app /Applications/ChatGPT.app "$HOME/Applications/Codex.app" "$HOME/Applications/ChatGPT.app"; do
      candidate="$app/Contents/Resources/cua_node/bin/node"
      if valid_node "$candidate"; then runtime=$candidate; break; fi
    done
  fi
fi
if [ -z "$runtime" ]; then
  echo 'My Micro needs Node.js 22+. In Codex, call load_workspace_dependencies and pass its Node executable through MY_MICRO_NODE, or install Node.js 22+.' >&2
  exit 2
fi
exec "$runtime" "$script_dir/my-micro.mjs" "$@"
