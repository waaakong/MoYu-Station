#!/usr/bin/env bash
set -euo pipefail

root="/srv/studyroom-updates/releases"
protected_file="/etc/studyroom/update-protected-releases"
apply="${1:-}"
[[ -d "$root" && "$(realpath -e -- "$root")" == "$root" ]] || exit 64
[[ -f "$protected_file" ]] || { echo "protected release list is required" >&2; exit 65; }

for channel in stable beta provider-experimental; do
  channel_root="$root/$channel"
  [[ -d "$channel_root" ]] || continue
  mapfile -t versions < <(find "$channel_root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -Vr)
  for index in "${!versions[@]}"; do
    version="${versions[$index]}"
    [[ "$version" =~ ^[0-9A-Za-z.-]{5,64}$ ]] || continue
    if (( index < 3 )) || grep -Fxq "$channel/$version" "$protected_file"; then continue; fi
    target="$channel_root/$version"
    target_real="$(realpath -e -- "$target")"
    [[ "$target_real" == "$channel_root/"* && ! -L "$target" ]] || exit 66
    if [[ "$apply" == "--apply" ]]; then
      rm -rf --one-file-system -- "$target_real"
      echo "removed $channel/$version"
    else
      echo "would remove $channel/$version"
    fi
  done
done
