#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
for script in "$DEPLOY_ROOT"/scripts/*.sh "$DEPLOY_ROOT"/scripts/lib/*.sh; do
  bash -n "$script"
  if command -v shellcheck >/dev/null 2>&1; then shellcheck -x -P "$DEPLOY_ROOT/scripts" "$script"; fi
done

[[ "${EUID:-$(id -u)}" -eq 0 ]] || {
  printf '%s\n' 'transaction test requires root; syntax checks passed' >&2
  exit 0
}

temporary="$(mktemp -d)"
trap 'rm -rf --one-file-system -- "$temporary"' EXIT
mkdir -p "$temporary/bin" "$temporary/nginx/upstreams" "$temporary/web-old" "$temporary/web-v1"
printf '%s\n' '#!/usr/bin/env bash' 'exit 1' > "$temporary/bin/nginx"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$temporary/bin/systemctl"
chmod 0700 "$temporary/bin/nginx" "$temporary/bin/systemctl"
printf '%s\n' 'server 127.0.0.1:8080;' > "$temporary/nginx/upstreams/v1.conf"
printf '%s\n' 'V1_WEB_ROOT='"$temporary/web-v1" > "$temporary/phase12.conf"
chmod 0600 "$temporary/phase12.conf"
touch "$temporary/nginx/maintenance.enabled"
ln -s "$temporary/nginx/upstreams/v1.conf" "$temporary/nginx/upstream.conf"
ln -s "$temporary/web-old" "$temporary/web-active"

set +e
PATH="$temporary/bin:/usr/bin:/bin" \
PHASE12_CONFIG="$temporary/phase12.conf" \
PHASE12_NGINX_STATE="$temporary/nginx" \
PHASE12_ACTIVE_WEB="$temporary/web-active" \
PHASE12_CONFIRM=SWITCH_V1 \
  "$DEPLOY_ROOT/scripts/switch-studyroom-upstream.sh" apply v1 >/dev/null 2>&1
status=$?
set -e
[[ "$status" -ne 0 ]]
[[ "$(readlink -f "$temporary/nginx/upstream.conf")" == "$temporary/nginx/upstreams/v1.conf" ]]
[[ "$(readlink -f "$temporary/web-active")" == "$temporary/web-old" ]]
printf '%s\n' 'phase12 tooling transaction test passed'
