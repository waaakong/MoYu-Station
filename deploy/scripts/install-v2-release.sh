#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-preview}"
case "$action" in
  preview)
    phase12_log INFO install_v2 PREVIEW
    printf '%s\n' \
      'Bootstrap: PHASE12_CONFIRM=BOOTSTRAP_V2 install-v2-release.sh bootstrap' \
      'Release:   PHASE12_CONFIRM=INSTALL_V2 install-v2-release.sh apply /srv/studyroom-v2/incoming/<release-id>'
    exit 0
    ;;
  bootstrap)
    phase12_require_root
    phase12_require_confirmation BOOTSTRAP_V2
    for command in getent install nginx systemctl systemd-tmpfiles useradd groupadd; do phase12_require_command "$command"; done
    if ! getent group studyroom-v2 >/dev/null; then groupadd --system studyroom-v2; fi
    if ! getent passwd studyroom-v2 >/dev/null; then
      useradd --system --gid studyroom-v2 --home-dir /var/lib/studyroom-v2 --no-create-home --shell /sbin/nologin studyroom-v2
    fi
    install -D -m 0644 "$DEPLOY_ROOT/tmpfiles/studyroom-v2.conf" /etc/tmpfiles.d/studyroom-v2.conf
    systemd-tmpfiles --create /etc/tmpfiles.d/studyroom-v2.conf
    install -D -m 0644 "$DEPLOY_ROOT/redis/studyroom-v2.conf" /etc/studyroom-v2/redis.conf
    install -D -m 0644 "$DEPLOY_ROOT/systemd/studyroom-v2-redis.service" /etc/systemd/system/studyroom-v2-redis.service
    install -D -m 0644 "$DEPLOY_ROOT/systemd/studyroom-v2.service" /etc/systemd/system/studyroom-v2.service
    install -D -m 0644 "$DEPLOY_ROOT/logrotate/studyroom-v2" /etc/logrotate.d/studyroom-v2
    install -D -m 0644 "$DEPLOY_ROOT/nginx/proxy-headers.conf" /etc/nginx/studyroom/proxy-headers.conf
    install -D -m 0644 "$DEPLOY_ROOT/nginx/studyroom-maintenance.conf" /etc/nginx/studyroom/maintenance.conf
    install -D -m 0644 "$DEPLOY_ROOT/nginx/upstream-v1.conf" /etc/nginx/studyroom/upstreams/v1.conf
    install -D -m 0644 "$DEPLOY_ROOT/nginx/upstream-v2.conf" /etc/nginx/studyroom/upstreams/v2.conf
    install -D -m 0644 "$DEPLOY_ROOT/nginx/maintenance.html" /srv/studyroom-maintenance/maintenance.html
    install -D -m 0644 "$DEPLOY_ROOT/nginx/studyroom-v2-candidate.conf" /etc/nginx/conf.d/studyroom-v2-candidate.conf
    systemctl daemon-reload
    systemctl enable --now studyroom-v2-redis.service
    nginx -t
    systemctl reload nginx.service
    phase12_log INFO install_v2_bootstrap APPLIED
    ;;
  apply)
    phase12_require_root
    phase12_require_confirmation INSTALL_V2
    incoming="${2:-}"
    phase12_assert_absolute "$incoming"
    incoming="$(phase12_assert_under "$PHASE12_INCOMING_ROOT" "$incoming")"
    phase12_assert_directory "$incoming"
    phase12_verify_release "$incoming" >/dev/null
    release_id="$(phase12_release_field "$incoming" releaseId)"
    git_sha="$(phase12_release_field "$incoming" gitSha)"
    [[ "$(basename -- "$incoming")" == "$release_id" ]] || phase12_die release_directory_mismatch 65
    destination="$(phase12_assert_under "$PHASE12_RELEASE_ROOT" "$PHASE12_RELEASE_ROOT/$release_id")"
    [[ ! -e "$destination" ]] || phase12_die release_already_installed 73
    phase12_assert_regular_file /etc/studyroom-v2/studyroom-v2.env
    grep -Fqx "STUDYROOM_RELEASE_ID=$release_id" /etc/studyroom-v2/studyroom-v2.env || phase12_die environment_release_mismatch 78
    grep -Fqx "STUDYROOM_RELEASE_GIT_SHA=$git_sha" /etc/studyroom-v2/studyroom-v2.env || phase12_die environment_sha_mismatch 78
    mkdir -p -- "$PHASE12_RELEASE_ROOT"
    phase12_same_filesystem "$incoming" "$PHASE12_RELEASE_ROOT"
    find "$incoming" -type d -exec chmod 0755 {} +
    find "$incoming" -type f -exec chmod 0644 {} +
    chown -R root:studyroom-v2 -- "$incoming"
    mv -- "$incoming" "$destination"
    phase12_atomic_symlink "$destination" /srv/studyroom-v2/current
    systemctl enable --now studyroom-v2.service
    phase12_log INFO install_v2_release APPLIED
    ;;
  *) phase12_die unsupported_action 64 ;;
esac
