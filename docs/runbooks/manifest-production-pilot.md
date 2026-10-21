# Manifest-signed production pilot preparation

Status: preparation only; not a deployment or acceptance report.

## Fixed candidate configuration

- Installed bootstrap: `0.2.0-trial.20261021.1`; next fixed candidate: `0.2.0-trial.20261021.4`. Immutable `.2` and `.3` candidates are held and must not be overwritten or offered. Real native-fault acceptance exposed premature application exit during installer launch failure and backup failures misclassified as network errors.
- Base reviewed product source: `7602a1a265a86c8271799e96088de316b1a5aa74`.
- Actual candidate source is the full commit in its CI artifact receipt, including this build configuration. Earlier CI results do not automatically validate that new commit.
- Production origin: `https://8.163.29.26`, API `/api`, stable channel, `manifest-signed`, checked-in Ed25519 public keys. No temporary 8443 endpoint.
- Keep app ID `xyz.moyustation.studyroom`, user data `StudyRoom`, existing local music and platform capabilities. Web platform music stays disabled. No account privileges are granted by build flags.
- Installers remain Authenticode unsigned. Windows prompts and UAC are not bypassed. The trusted release workflow remains unchanged.

The dedicated CI workflow has read-only repository permissions and uploads short-lived candidate artifacts only. It neither signs manifests nor creates a GitHub Release, changes production policy, or installs anything. Signing is performed separately using the restricted local key, outside CI and outside the repository. Artifact receipts include source, version, public-key digest, configuration and file sizes/SHA-256; verification must additionally inspect the packaged runtime configuration.

The candidate workflow is manually dispatched from reviewed `main`, not from the deleted development branch. Its fixed `.4` version and artifact source SHA prevent accidentally rebuilding the handed-off `.1`, `.2` or `.3` files under the same identity. Do not dispatch before reviewing and freezing the new fixes.

## Gates before production execution

1. Save immutable CI artifacts and receipts; independently verify installer identity, runtime version/origins/features, lengths and hashes, then sign and verify the immutable release manifest locally.
2. Run the complete CI twice at the final source commit with zero browser retries. Preserve existing unverified visual-baseline limitations.
3. Complete real business-backend eligibility, revocation, grant and policy tests, plus the remaining actual updater failure cases. Synthetic control-plane acceptance is not sufficient.
4. Submit a concrete execution checklist for confirmation: production paths and versions, no new migration after verifying schema, backup/restore evidence, maintenance scope, health checks and rollback triggers.
5. Recheck normal client exit before backing up and covering the original installation. Never force-kill the client or replace real user data with synthetic data.

## Pilot and release boundary

Use a specifically confirmed single account for the first pilot. Keep audience `members`; verify that the stable membership contains only that authorized pilot before activating a `PILOT` release. Do not infer an empty membership table from a failed query. Keep beta/experimental scope unchanged.

The manual bootstrap installer must be installed before an old client can gain the new trust configuration. Verify bootstrap to upgrade using the real production authorization path, including automatic restart, original installation path, current version and preserved data.

The same rule applies to updater bug fixes: a target installer cannot repair the already-running bootstrap before its first handoff. Request explicit confirmation of a replacement bootstrap route before changing the user's requirement to upgrade the formal client through push. Do not waive the failed native-startup gate or silently replace the formal installation.

The confirmed-launch adapter is used only by manifest-signed per-user full installers. It preserves upstream verification and NSIS argument generation and waits for the actual spawn event before quitting. Native execution denial does not authorize shell/elevation fallback; administrator-required packages fail closed for manual installation. The trusted updater remains unchanged. Revalidate this adapter whenever the pinned electron-updater version changes.

Only after pilot acceptance may registered stable rollout proceed manually at 10%, 50%, then 100%, checking failures between stages. No timer automatically increases exposure. Pause on any installation or data error.

Every formal client release must synchronize the installer, authenticated download page metadata and SHA-256, version-specific changelog, and public/private source/release records. Public installer availability does not remove login/eligibility checks from the updater control plane. Application/configuration rollback must not overwrite new database or user records with an old backup.

## Existing evidence and remaining limitations

Reviewed source `7602a1a` passed two complete CI attempts and a real Windows Sandbox `.5 → .6` one-click download/install/restart with synthetic data and consistent backup retention. That evidence uses an isolated synthetic HTTPS control plane; it is not production authorization acceptance. Real fault-matrix completion, production-origin artifact validation, production pilot and full release synchronization remain separate gates.

The frozen business backend subsequently passed 18 checks against a separate synthetic MySQL database, Linux Redis, verified HTTPS and WSS: eligibility, two sessions, revocations, bounded grant expiry, pause/withdrawal, Redis recovery and bounded login-rate limiting. The capped temporary services have stopped and their ports are closed. Component tests cover native launch errors, disk exhaustion and real SQLite backup failure; these are not evidence of the complete physical installer fault matrix or the `.1 → .3` production pilot.
