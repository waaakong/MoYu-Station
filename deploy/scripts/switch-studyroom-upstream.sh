#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-preview}"
target="${2:-v2}"
[[ "$target" == v1 || "$target" == v2 ]] || phase12_die invalid_target 64
phase12_load_config "${PHASE12_CONFIG:-/etc/studyroom/phase12.conf}"

case "$target" in
  v1)
    target_upstream="$PHASE12_NGINX_STATE/upstreams/v1.conf"
    target_web="${V1_WEB_ROOT:-}"
    confirmation=SWITCH_V1
    ;;
  v2)
    target_upstream="$PHASE12_NGINX_STATE/upstreams/v2.conf"
    target_web=/srv/studyroom-v2/current/web
    confirmation=SWITCH_V2
    ;;
esac
phase12_assert_regular_file "$target_upstream"
phase12_assert_directory "$target_web"

if [[ "$action" == preview ]]; then
  phase12_log INFO "switch_$target" PREVIEW
  printf 'upstream=%s\nweb=%s\n' "$target_upstream" "$target_web"
  exit 0
fi
[[ "$action" == apply ]] || phase12_die unsupported_action 64
phase12_require_root
phase12_require_confirmation "$confirmation"
phase12_require_command nginx
[[ -f "$PHASE12_NGINX_STATE/maintenance.enabled" ]] || phase12_die maintenance_not_enabled 78

if [[ "$target" == v2 ]]; then
  systemctl is-active --quiet studyroom-v2.service || phase12_die v2_service_inactive 69
  release="$(readlink -f /srv/studyroom-v2/current)"
  release="$(phase12_assert_under "$PHASE12_RELEASE_ROOT" "$release")"
  phase12_verify_release "$release" >/dev/null
else
  systemctl is-active --quiet study-room.service || phase12_die v1_service_inactive 69
fi

active_upstream="$PHASE12_NGINX_STATE/upstream.conf"
old_upstream="$(readlink -f "$active_upstream" 2>/dev/null || true)"
old_web="$(readlink -f "$PHASE12_ACTIVE_WEB" 2>/dev/null || true)"

restore_links() {
  if [[ -n "$old_upstream" && -e "$old_upstream" ]]; then
    phase12_atomic_symlink "$old_upstream" "$active_upstream"
  else
    rm -f -- "$active_upstream"
  fi
  if [[ -n "$old_web" && -e "$old_web" ]]; then
    phase12_atomic_symlink "$old_web" "$PHASE12_ACTIVE_WEB"
  else
    rm -f -- "$PHASE12_ACTIVE_WEB"
  fi
}

phase12_atomic_symlink "$target_upstream" "$active_upstream"
phase12_atomic_symlink "$target_web" "$PHASE12_ACTIVE_WEB"
if ! nginx -t; then
  restore_links
  nginx -t >/dev/null 2>&1 || true
  phase12_die nginx_validation_failed 78
fi
if ! systemctl reload nginx.service; then
  restore_links
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx.service || true
  fi
  phase12_die nginx_reload_failed 70
fi
phase12_log INFO "switch_$target" APPLIED
