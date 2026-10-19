#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-snapshot}"
interval="${2:-60}"
samples="${3:-1}"
[[ "$action" == snapshot || "$action" == watch ]] || phase12_die unsupported_action 64
[[ "$interval" =~ ^[0-9]+$ && "$interval" -ge 5 && "$interval" -le 900 ]] || phase12_die interval_invalid 64
[[ "$samples" =~ ^[0-9]+$ && "$samples" -ge 1 && "$samples" -le 17280 ]] || phase12_die sample_count_invalid 64
if [[ "$action" == snapshot ]]; then samples=1; fi

sample() {
  local mem_available swap_total swap_free swap_in_pages swap_out_pages root_free process_rss redis_memory restarts health
  mem_available="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
  swap_total="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  swap_free="$(awk '/SwapFree:/ {print $2}' /proc/meminfo)"
  swap_in_pages="$(awk '$1 == "pswpin" {print $2}' /proc/vmstat)"
  swap_out_pages="$(awk '$1 == "pswpout" {print $2}' /proc/vmstat)"
  root_free="$(df -Pk / | awk 'NR==2 {print $4}')"
  process_rss="$(systemctl show studyroom-v2.service -p MemoryCurrent --value 2>/dev/null || printf 0)"
  restarts="$(systemctl show studyroom-v2.service -p NRestarts --value 2>/dev/null || printf 0)"
  redis_memory="$(redis-cli -h 127.0.0.1 -p 6380 --raw INFO memory 2>/dev/null | awk -F: '/^used_memory:/{gsub(/\r/, "", $2); print $2}' || printf 0)"
  health="$(curl --silent --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:8180/api/system/health/ready || printf 000)"
  printf '{"time":"%s","memAvailableKiB":%s,"swapUsedKiB":%s,"swapInPages":%s,"swapOutPages":%s,"rootFreeKiB":%s,"v2MemoryBytes":%s,"v2Restarts":%s,"redisBytes":%s,"readyHttp":"%s"}\n' \
    "$(phase12_now)" "${mem_available:-0}" "$(( ${swap_total:-0} - ${swap_free:-0} ))" "${swap_in_pages:-0}" "${swap_out_pages:-0}" "${root_free:-0}" \
    "${process_rss:-0}" "${restarts:-0}" "${redis_memory:-0}" "${health:-000}"
}

for ((index = 1; index <= samples; index++)); do
  sample
  if (( index < samples )); then sleep "$interval"; fi
done
