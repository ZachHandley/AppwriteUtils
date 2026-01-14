#!/usr/bin/env bash
set -euo pipefail

pkg_dir="$1"
pkg_name="$2"
force_publish="${FORCE_PUBLISH:-false}"

before="${GITHUB_EVENT_BEFORE:-}"
sha="${GITHUB_SHA:-HEAD}"

changed=1
if [[ -n "$before" && "$before" != "0000000000000000000000000000000000000000" ]]; then
  if git diff --name-only "$before" "$sha" | rg -q "^${pkg_dir}/"; then
    changed=1
  else
    changed=0
  fi
fi

local_version="$(node -p "require('./${pkg_dir}/package.json').version")"
remote_version="$(npm view "$pkg_name" version 2>/dev/null || echo "0.0.0")"
compare="$(node scripts/ci/compare-semver.js "$local_version" "$remote_version")"

if [[ "$force_publish" == "true" ]]; then
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "should_publish=true"
      echo "local_version=${local_version}"
      echo "remote_version=${remote_version}"
    } >> "$GITHUB_OUTPUT"
  else
    echo "should_publish=true"
    echo "local_version=${local_version}"
    echo "remote_version=${remote_version}"
  fi
  exit 0
fi

should_publish=false
if [[ "$changed" -eq 1 && "$compare" -gt 0 ]]; then
  should_publish=true
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "should_publish=${should_publish}"
    echo "local_version=${local_version}"
    echo "remote_version=${remote_version}"
  } >> "$GITHUB_OUTPUT"
else
  echo "should_publish=${should_publish}"
  echo "local_version=${local_version}"
  echo "remote_version=${remote_version}"
fi

if [[ "$changed" -eq 1 && "$compare" -le 0 ]]; then
  echo "Package ${pkg_name} changed but version ${local_version} is not greater than npm ${remote_version}." >&2
  exit 1
fi
