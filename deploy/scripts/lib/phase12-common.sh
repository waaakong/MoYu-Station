#!/usr/bin/env bash

PHASE12_RELEASE_ROOT="${PHASE12_RELEASE_ROOT:-/srv/studyroom-v2/releases}"
PHASE12_INCOMING_ROOT="${PHASE12_INCOMING_ROOT:-/srv/studyroom-v2/incoming}"
PHASE12_BACKUP_ROOT="${PHASE12_BACKUP_ROOT:-/opt/study-room/backups}"
PHASE12_NGINX_STATE="${PHASE12_NGINX_STATE:-/etc/nginx/studyroom}"
PHASE12_ACTIVE_WEB="${PHASE12_ACTIVE_WEB:-/srv/studyroom-active-web}"

phase12_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

phase12_log() {
  local level="$1" event="$2" status="$3"
  case "$level$event$status" in *[!A-Za-z0-9_.:-]*) return 64 ;; esac
  printf '{"time":"%s","level":"%s","event":"%s","status":"%s"}\n' \
    "$(phase12_now)" "$level" "$event" "$status"
}

phase12_die() {
  phase12_log ERROR "$1" FAILED >&2
  exit "${2:-1}"
}

phase12_require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || phase12_die root_required 77
}

phase12_require_command() {
  command -v "$1" >/dev/null 2>&1 || phase12_die "missing_$1" 69
}

phase12_require_value() {
  local name="$1" value="${2:-}"
  [[ -n "$value" ]] || phase12_die "missing_$name" 64
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || phase12_die "invalid_$name" 64
}

phase12_assert_absolute() {
  local value="$1"
  phase12_require_value path "$value"
  [[ "$value" == /* && "$value" != "/" ]] || phase12_die unsafe_path 64
}

phase12_resolve() {
  readlink -m -- "$1"
}

phase12_assert_under() {
  local root target resolved_root resolved_target
  root="$1"
  target="$2"
  phase12_assert_absolute "$root"
  phase12_assert_absolute "$target"
  resolved_root="$(phase12_resolve "$root")"
  resolved_target="$(phase12_resolve "$target")"
  case "$resolved_target" in
    "$resolved_root"/*) printf '%s\n' "$resolved_target" ;;
    *) phase12_die path_escape 64 ;;
  esac
}

phase12_assert_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || phase12_die invalid_file 66
}

phase12_assert_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" ]] || phase12_die invalid_directory 66
}

phase12_require_confirmation() {
  local expected="$1"
  [[ "${PHASE12_CONFIRM:-}" == "$expected" ]] || phase12_die confirmation_required 78
}

phase12_load_config() {
  local config="${1:-/etc/studyroom/phase12.conf}" owner mode
  phase12_assert_absolute "$config"
  phase12_assert_regular_file "$config"
  owner="$(stat -c '%u' "$config")"
  mode="$(stat -c '%a' "$config")"
  [[ "$owner" == 0 ]] || phase12_die config_owner_invalid 78
  (( (8#$mode & 8#022) == 0 )) || phase12_die config_permissions_invalid 78
  # shellcheck disable=SC1090
  source "$config"
}

phase12_verify_release() {
  local directory="$1" script_dir
  phase12_assert_absolute "$directory"
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  python3 "$script_dir/verify-release.py" "$directory"
}

phase12_release_field() {
  local directory="$1" field="$2"
  python3 - "$directory/release.json" "$field" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle).get(sys.argv[2])
if not isinstance(value, str) or not value:
    raise SystemExit(65)
print(value)
PY
}

phase12_atomic_symlink() {
  local target="$1" link="$2" temporary
  phase12_assert_absolute "$target"
  phase12_assert_absolute "$link"
  [[ -e "$target" ]] || phase12_die symlink_target_missing 66
  mkdir -p -- "$(dirname -- "$link")"
  temporary="${link}.new.$$"
  rm -f -- "$temporary"
  ln -s -- "$target" "$temporary"
  mv -Tf -- "$temporary" "$link"
}

phase12_same_filesystem() {
  local left="$1" right="$2"
  [[ "$(stat -c '%d' "$left")" == "$(stat -c '%d' "$right")" ]] || phase12_die cross_filesystem_move 74
}
