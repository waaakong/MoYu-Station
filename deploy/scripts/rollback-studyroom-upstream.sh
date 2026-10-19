#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-preview}"
if [[ "$action" == preview ]]; then
  phase12_log INFO rollback_v1 PREVIEW
  printf '%s\n' 'Rollback changes application upstream and static files only; it never restores the database.'
  exit 0
fi
[[ "$action" == apply ]] || phase12_die unsupported_action 64
phase12_require_root
phase12_require_confirmation ROLLBACK_V1
mkdir -p -- "$PHASE12_NGINX_STATE"
install -m 0644 /dev/null "$PHASE12_NGINX_STATE/maintenance.enabled"
systemctl enable --now study-room.service
PHASE12_CONFIRM=SWITCH_V1 "$SCRIPT_DIR/switch-studyroom-upstream.sh" apply v1
systemctl disable --now studyroom-v2.service
phase12_log INFO rollback_v1 APPLIED
