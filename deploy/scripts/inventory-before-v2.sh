#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-preview}"
output="${2:-}"
case "$action" in
  preview)
    phase12_log INFO inventory PREVIEW
    printf '%s\n' 'Usage: inventory-before-v2.sh collect /absolute/root-owned/output.json'
    exit 0
    ;;
  collect) ;;
  *) phase12_die unsupported_action 64 ;;
esac
phase12_require_root
phase12_assert_absolute "$output"
[[ ! -e "$output" ]] || phase12_die output_exists 73
mkdir -p -- "$(dirname -- "$output")"

python3 - "$output" <<'PY'
import json, os, pathlib, shutil, socket, subprocess, sys, time

def run(args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=15, check=False)
    return {"code": result.returncode, "output": result.stdout.strip()[:8192]}

memory = {}
for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
    if ":" in line:
        key, value = line.split(":", 1)
        if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree"}:
            memory[key] = int(value.strip().split()[0])
disk = shutil.disk_usage("/")
payload = {
    "schemaVersion": 1,
    "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "hostnameHash": __import__("hashlib").sha256(socket.gethostname().encode()).hexdigest()[:16],
    "memoryKiB": memory,
    "rootDiskBytes": {"total": disk.total, "used": disk.used, "free": disk.free},
    "services": {name: run(["systemctl", "is-active", name]) for name in ["study-room.service", "mysqld.service", "redis.service", "nginx.service"]},
    "ports": run(["ss", "-ltnp"]),
    "versions": {
        "java": run(["java", "-version"]),
        "mysql": run(["mysql", "--version"]),
        "redis": run(["redis-server", "--version"]),
        "nginx": run(["nginx", "-v"]),
    },
}
target = pathlib.Path(sys.argv[1])
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
os.chmod(target, 0o640)
PY
phase12_log INFO inventory COLLECTED
