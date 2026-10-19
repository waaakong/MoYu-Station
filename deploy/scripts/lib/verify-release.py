#!/usr/bin/env python3
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path, PurePosixPath

RELEASE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,95}$")
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")


def fail(code: str) -> None:
    print(json.dumps({"event": "release_verify", "status": "FAILED", "code": code}), file=sys.stderr)
    raise SystemExit(1)


def assert_no_symlink(root: Path, target: Path) -> None:
    current = root
    for part in target.relative_to(root).parts:
        current = current / part
        if stat.S_ISLNK(os.lstat(current).st_mode):
            fail("SYMLINK_FORBIDDEN")


def main() -> None:
    if len(sys.argv) != 2:
        fail("ARGUMENT_INVALID")
    root = Path(sys.argv[1])
    if not root.is_absolute() or not root.is_dir() or root.is_symlink():
        fail("RELEASE_ROOT_INVALID")
    root = root.resolve(strict=True)
    manifest_path = root / "release.json"
    if not manifest_path.is_file() or manifest_path.is_symlink() or manifest_path.stat().st_size > 4 * 1024 * 1024:
        fail("MANIFEST_INVALID")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        fail("MANIFEST_INVALID")
    if (manifest.get("schemaVersion") != 1 or
            not RELEASE_ID.fullmatch(manifest.get("releaseId", "")) or
            not GIT_SHA.fullmatch(manifest.get("gitSha", "")) or
            not isinstance(manifest.get("artifacts"), list) or
            not manifest["artifacts"]):
        fail("MANIFEST_INVALID")

    expected = set()
    total = 0
    for item in manifest["artifacts"]:
        if not isinstance(item, dict):
            fail("ARTIFACT_INVALID")
        raw_path = item.get("path")
        posix = PurePosixPath(raw_path) if isinstance(raw_path, str) else None
        if (posix is None or posix.is_absolute() or ".." in posix.parts or "." in posix.parts or
                "\\" in raw_path or raw_path in expected or raw_path == "release.json"):
            fail("ARTIFACT_PATH_INVALID")
        expected.add(raw_path)
        target = root.joinpath(*posix.parts)
        try:
            assert_no_symlink(root, target)
            target_stat = target.stat()
        except (FileNotFoundError, ValueError):
            fail("ARTIFACT_MISSING")
        if not target.is_file() or target_stat.st_size != item.get("size"):
            fail("ARTIFACT_SIZE_MISMATCH")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")) or digest != item["sha256"]:
            fail("ARTIFACT_HASH_MISMATCH")
        total += target_stat.st_size

    discovered = list(root.rglob("*"))
    if any(path.is_symlink() for path in discovered):
        fail("SYMLINK_FORBIDDEN")
    actual = {
        path.relative_to(root).as_posix()
        for path in discovered
        if path.is_file() and path != manifest_path
    }
    if actual != expected:
        fail("ARTIFACT_SET_MISMATCH")
    if total != manifest.get("totalSize"):
        fail("TOTAL_SIZE_MISMATCH")
    print(json.dumps({
        "event": "release_verify",
        "status": "PASSED",
        "releaseId": manifest["releaseId"],
        "gitSha": manifest["gitSha"],
        "artifacts": len(expected),
        "totalSize": total,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
