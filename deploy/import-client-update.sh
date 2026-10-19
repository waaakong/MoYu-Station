#!/usr/bin/env bash
set -euo pipefail

channel="${1:?channel required}"
version="${2:?version required}"
incoming="${3:?incoming directory required}"
case "$channel" in stable|beta|provider-experimental) ;; *) exit 64 ;; esac
[[ "$version" =~ ^[0-9A-Za-z.-]{5,64}$ ]] || exit 64
incoming_real="$(realpath -e -- "$incoming")"
[[ "$incoming_real" == /srv/studyroom-updates/incoming/* ]] || exit 64
find "$incoming_real" -type l -print -quit | grep -q . && exit 65

target="/srv/studyroom-updates/releases/$channel/$version"
[[ ! -e "$target" ]] || { echo "immutable release already exists" >&2; exit 66; }
install -d -m 0750 "$(dirname "$target")"
mv -- "$incoming_real" "$target"
chmod -R a-w "$target"

source /etc/studyroom/update-import.env
payload="$(jq -n --rawfile manifest "$target/release.json" --argjson signed "$(cat "$target/release.json.sig")" '{manifestJson:$manifest,signature:$signed.signature,keyId:$signed.keyId}')"
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8080/api/internal/client-updates/import \
  --header "Content-Type: application/json" \
  --header "X-StudyRoom-Import-Secret: $STUDYROOM_UPDATE_IMPORT_SECRET" \
  --data-binary "$payload"
