#!/usr/bin/env bash
set -euo pipefail

target_binary="${HOME}/.local/bin/agents"
rm -f "${target_binary}"
printf 'Removed %s\n' "${target_binary}"
