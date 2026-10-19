#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

[[ "${1:-check}" == "check" ]] || phase12_die unsupported_action 64
expected_sha="${2:-}"
phase12_require_value expected_sha "$expected_sha"
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || phase12_die invalid_expected_sha 64
for command in curl python3 ss systemctl; do phase12_require_command "$command"; done

release="$(readlink -f /srv/studyroom-v2/current)"
release="$(phase12_assert_under "$PHASE12_RELEASE_ROOT" "$release")"
phase12_verify_release "$release" >/dev/null
[[ "$(phase12_release_field "$release" gitSha)" == "$expected_sha" ]] || phase12_die manifest_sha_mismatch 65
systemctl is-active --quiet studyroom-v2-redis.service || phase12_die redis_service_inactive 69
systemctl is-active --quiet studyroom-v2.service || phase12_die v2_service_inactive 69

ss -ltn | awk '{print $4}' | grep -Eq '^(127\.0\.0\.1|\[::ffff:127\.0\.0\.1\]):8180$' || phase12_die v2_loopback_missing 69
ss -ltn | awk '{print $4}' | grep -Eq '^127\.0\.0\.1:8280$' || phase12_die candidate_loopback_missing 69
ss -ltn | awk '{print $4}' | grep -Eq '^127\.0\.0\.1:6380$|^\[::1\]:6380$' || phase12_die redis_loopback_missing 69
! ss -ltn | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\[::\]):(8180|8280|6380)$' || phase12_die candidate_public_listener 69

live="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8180/api/system/health/live)"
ready="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8180/api/system/health/ready)"
candidate="$(curl --fail --silent --show-error --max-time 5 -H 'Host: phase12-candidate.internal' http://127.0.0.1:8280/api/system/health/ready)"
python3 - "$expected_sha" "$live" "$ready" "$candidate" <<'PY'
import json, sys
expected = sys.argv[1]
for index, raw in enumerate(sys.argv[2:], start=1):
    data = json.loads(raw)
    if data.get("gitSha") != expected:
        raise SystemExit(65)
    if index > 1 and data.get("state") != "READY":
        raise SystemExit(69)
PY

[[ "$(systemctl show studyroom-v2.service -p MemoryMax --value)" == "469762048" ]] || phase12_die memory_max_mismatch 78
restarts="$(systemctl show studyroom-v2.service -p NRestarts --value)"
[[ "$restarts" =~ ^[0-9]+$ && "$restarts" -le 3 ]] || phase12_die restart_budget_exceeded 70
phase12_log INFO candidate_verification PASSED
