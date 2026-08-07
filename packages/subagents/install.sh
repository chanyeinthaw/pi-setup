#!/usr/bin/env bash
set -euo pipefail

package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${package_dir}/../.." && pwd)"
source_binary="${repository_root}/dist/subagents"
target_dir="${HOME}/.local/bin"
target_binary="${target_dir}/subagents"

if [[ ! -f "${source_binary}" ]]; then
  printf 'Built binary not found: %s\n' "${source_binary}" >&2
  printf 'Build it first with: pnpm subagents:build\n' >&2
  exit 1
fi

mkdir -p "${target_dir}"
temporary="$(mktemp "${target_dir}/.subagents.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
install -m755 "${source_binary}" "${temporary}"
mv -f "${temporary}" "${target_binary}"
trap - EXIT

printf 'Installed subagents to %s\n' "${target_binary}"
