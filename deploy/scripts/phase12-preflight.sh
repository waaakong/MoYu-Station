#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

[[ "${1:-check}" == "check" ]] || phase12_die unsupported_action 64
phase12_require_root
phase12_load_config "${PHASE12_CONFIG:-/etc/studyroom/phase12.conf}"
for command in awk curl df findmnt free getent mysql nginx redis-cli ss stat systemctl; do
  phase12_require_command "$command"
done

failures=0
check() {
  local event="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    phase12_log INFO "$event" PASSED
  else
    phase12_log ERROR "$event" FAILED
    failures=$((failures + 1))
  fi
}

check v1_service systemctl is-active --quiet study-room.service
check mysql_service systemctl is-active --quiet mysqld.service
check redis_service systemctl is-active --quiet redis.service
check nginx_config nginx -t
check v1_loopback bash -c "ss -ltn | awk '{print \$4}' | grep -Eq '^(127\\.0\\.0\\.1|\\[::1\\]|\\[::ffff:127\\.0\\.0\\.1\\]):8080$'"
check candidate_port_free bash -c "! ss -ltn | awk '{print \$4}' | grep -Eq '(:|])8180$|(:|])8280$|(:|])6380$'"
check mysql_ping mysql --connect-timeout=3 --batch --skip-column-names -e 'SELECT 1'
check redis_ping bash -c "redis-cli -h 127.0.0.1 -p 6379 --raw PING | grep -qx PONG"

available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
disk_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
inode_percent="$(df -Pi / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
[[ "$available_kb" =~ ^[0-9]+$ && "$available_kb" -ge 358400 ]] || { phase12_log ERROR available_memory FAILED; failures=$((failures + 1)); }
[[ "$disk_kb" =~ ^[0-9]+$ && "$disk_kb" -ge 15728640 ]] || { phase12_log ERROR available_disk FAILED; failures=$((failures + 1)); }
[[ "$inode_percent" =~ ^[0-9]+$ && "$inode_percent" -lt 85 ]] || { phase12_log ERROR inode_watermark FAILED; failures=$((failures + 1)); }

root_source="$(findmnt -n -T / -o SOURCE)"
backup_source="$(findmnt -n -T "$(dirname "$PHASE12_BACKUP_ROOT")" -o SOURCE 2>/dev/null || true)"
if [[ -n "$backup_source" && "$root_source" == "$backup_source" ]]; then
  phase12_log WARN backup_same_device REVIEW
else
  phase12_log INFO backup_device_separation PASSED
fi

case "${PUBLIC_ENTRY_MODE:-domain}" in
  domain)
    public_domain="${PUBLIC_DOMAIN:-moyustation.xyz}"
    phase12_require_value PUBLIC_DOMAIN "$public_domain"
    getent ahostsv4 "$public_domain" | awk '{print $1}' | sort -u | grep -q . || {
      phase12_log ERROR dns_a_record FAILED
      failures=$((failures + 1))
    }
    ;;
  ip)
    public_ip="${PUBLIC_IP:-}"
    phase12_require_value PUBLIC_IP "$public_ip"
    [[ "$public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || phase12_die invalid_PUBLIC_IP 64
    check public_ip_https curl --fail --silent --show-error --max-time 8 "https://$public_ip/api/auth/me"
    ;;
  *) phase12_die invalid_PUBLIC_ENTRY_MODE 64 ;;
esac
if (( failures > 0 )); then
  phase12_die preflight_gate 1
fi
phase12_log INFO preflight_gate PASSED
