#!/usr/bin/env bash
set -euo pipefail

target_binary="${HOME}/.local/bin/subagents"
rm -f "${target_binary}"
printf 'Removed subagents binary %s\n' "${target_binary}"
