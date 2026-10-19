#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/phase12-common.sh
source "$SCRIPT_DIR/lib/phase12-common.sh"

action="${1:-preview}"
config="${PHASE12_CONFIG:-/etc/studyroom/phase12.conf}"
case "$action" in
  preview)
    phase12_log INFO backup PREVIEW
    printf '%s\n' "Target root: $PHASE12_BACKUP_ROOT" 'Execution requires: PHASE12_CONFIRM=BACKUP backup-before-v2.sh create'
    exit 0
    ;;
  create) ;;
  *) phase12_die unsupported_action 64 ;;
esac
phase12_require_root
phase12_require_confirmation BACKUP
phase12_load_config "$config"
for command in gzip mysqldump sha256sum tar; do phase12_require_command "$command"; done

phase12_require_value PROD_DB_NAME "${PROD_DB_NAME:-}"
phase12_require_value MYSQL_DEFAULTS_FILE "${MYSQL_DEFAULTS_FILE:-}"
phase12_require_value V1_JAR_PATH "${V1_JAR_PATH:-}"
phase12_require_value V1_WEB_ROOT "${V1_WEB_ROOT:-}"
phase12_require_value PROD_UPLOAD_ROOT "${PROD_UPLOAD_ROOT:-}"
phase12_assert_regular_file "$MYSQL_DEFAULTS_FILE"
phase12_assert_regular_file "$V1_JAR_PATH"
phase12_assert_directory "$V1_WEB_ROOT"
phase12_assert_directory "$PROD_UPLOAD_ROOT"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -- "$PHASE12_BACKUP_ROOT"
chmod 700 "$PHASE12_BACKUP_ROOT"
target="$(phase12_assert_under "$PHASE12_BACKUP_ROOT" "$PHASE12_BACKUP_ROOT/phase12-$stamp")"
staging="$(phase12_assert_under "$PHASE12_BACKUP_ROOT" "$PHASE12_BACKUP_ROOT/.phase12-$stamp.tmp")"
[[ ! -e "$target" && ! -e "$staging" ]] || phase12_die backup_target_exists 73
mkdir -m 700 -- "$staging"
sums_file=""
cleanup() {
  [[ -d "$staging" ]] && rm -rf --one-file-system -- "$staging"
  [[ -n "$sums_file" && -f "$sums_file" ]] && rm -f -- "$sums_file"
}
trap cleanup EXIT

phase12_log INFO database_backup STARTED
mysqldump --defaults-extra-file="$MYSQL_DEFAULTS_FILE" \
  --single-transaction --quick --routines --triggers --events \
  --hex-blob --set-gtid-purged=OFF --databases "$PROD_DB_NAME" | gzip -9 > "$staging/database.sql.gz"
gzip -t "$staging/database.sql.gz"

phase12_log INFO uploads_backup STARTED
tar -C "$(dirname -- "$PROD_UPLOAD_ROOT")" -czf "$staging/uploads.tar.gz" "$(basename -- "$PROD_UPLOAD_ROOT")"
tar -tzf "$staging/uploads.tar.gz" >/dev/null

install -m 600 -- "$V1_JAR_PATH" "$staging/v1-application.jar"
tar -C "$(dirname -- "$V1_WEB_ROOT")" -czf "$staging/v1-web.tar.gz" "$(basename -- "$V1_WEB_ROOT")"
tar -tzf "$staging/v1-web.tar.gz" >/dev/null

{
  printf 'created_at=%s\n' "$(phase12_now)"
  printf 'database=%s\n' "$PROD_DB_NAME"
  printf 'v1_jar_size=%s\n' "$(stat -c '%s' "$V1_JAR_PATH")"
  printf 'upload_size_bytes=%s\n' "$(du -sb "$PROD_UPLOAD_ROOT" | awk '{print $1}')"
  printf 'environment_keys='; awk -F= '/^[A-Z][A-Z0-9_]*=/{printf "%s,", $1}' "${V1_ENV_FILE:-/etc/study-room/study-room.env}" 2>/dev/null || true; printf '\n'
  systemctl show study-room.service -p FragmentPath -p ExecStart -p User -p Group -p MemoryCurrent -p MemoryMax --no-pager
} > "$staging/config-metadata.txt"

if [[ -n "${V1_SOURCE_ROOT:-}" && -d "$V1_SOURCE_ROOT/.git" && ! -L "$V1_SOURCE_ROOT" ]] &&
   git -c "safe.directory=$V1_SOURCE_ROOT" -C "$V1_SOURCE_ROOT" rev-parse --verify HEAD >/dev/null 2>&1; then
  git -c "safe.directory=$V1_SOURCE_ROOT" -C "$V1_SOURCE_ROOT" bundle create "$staging/v1-source.bundle" --all
  git -c "safe.directory=$V1_SOURCE_ROOT" -C "$V1_SOURCE_ROOT" bundle verify "$staging/v1-source.bundle" >/dev/null
elif [[ -n "${V1_SOURCE_ROOT:-}" ]]; then
  phase12_log WARN source_bundle SKIPPED
fi

cat > "$staging/RESTORE.md" <<'EOF'
# Phase 12 recovery material

Verify `SHA256SUMS` before use. Restoring the database is intentionally not
automated and requires separate approval. Application-only rollback uses the
saved V1 JAR/Web archive and the Phase 12 upstream rollback script. Database
recovery must target a new empty database first and be validated before any
production replacement is considered.
EOF

sums_file="$(mktemp "$PHASE12_BACKUP_ROOT/.phase12-sums.XXXXXX")"
(
  cd "$staging"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > "$sums_file"
mv -- "$sums_file" "$staging/SHA256SUMS"
sums_file=""
(
  cd "$staging"
  sha256sum -c SHA256SUMS >/dev/null
)
phase12_same_filesystem "$staging" "$PHASE12_BACKUP_ROOT"
mv -- "$staging" "$target"
trap - EXIT

if [[ -n "${SECONDARY_EVIDENCE_DIR:-}" ]]; then
  phase12_assert_absolute "$SECONDARY_EVIDENCE_DIR"
  mkdir -p -- "$SECONDARY_EVIDENCE_DIR"
  install -m 600 -- "$target/SHA256SUMS" "$SECONDARY_EVIDENCE_DIR/phase12-$stamp-SHA256SUMS"
  install -m 600 -- "$target/RESTORE.md" "$SECONDARY_EVIDENCE_DIR/phase12-$stamp-RESTORE.md"
  phase12_log INFO secondary_evidence COPIED
else
  phase12_log WARN secondary_evidence MISSING
fi
phase12_log INFO backup CREATED
printf '%s\n' "$target"
