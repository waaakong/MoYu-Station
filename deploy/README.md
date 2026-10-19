# Production deployment

The production host uses Nginx for the Vue build and reverse proxying, a
systemd-managed Spring Boot service, MySQL 8, and Redis. Runtime secrets stay in
`/etc/study-room/study-room.env` and must not be committed.

Private client update templates live in `nginx/study-room-updates.conf` and
`import-client-update.sh`. Do not install or enable them before phase 12 and the
certificate, isolated upgrade, rollback, and explicit approval gates in
`docs/runbooks/private-client-update-release.md` have passed.

## Paths

- Git checkout: `/opt/study-room/source`
- Backend artifact: `/opt/study-room/app/study-room-backend.jar`
- Upload data: `/opt/study-room/backend/uploads`
- Frontend build: `/var/www/study-room`
- Environment: `/etc/study-room/study-room.env`
- Nginx site: `/etc/nginx/conf.d/study-room.conf`
- systemd unit: `/etc/systemd/system/study-room.service`

## Release verification

After a release, verify the service and reverse proxy before requesting or
renewing TLS:

```bash
systemctl status study-room --no-pager
nginx -t
curl --fail http://127.0.0.1:8080/api/auth/me
curl --fail -H 'Host: moyustation.xyz' http://127.0.0.1/
```

The auth endpoint may return an application-level unauthenticated response; it
is still useful for confirming that the API process and proxy path are alive.

## Temporary public IP HTTPS entry

While domain filing is deferred, V1 is available through
`https://8.163.29.26`. Install `nginx/study-room-ip-https.conf` as
`/etc/nginx/conf.d/00-study-room-ip-https.conf`. It keeps ACME HTTP-01
challenges available and redirects all other direct-IP HTTP requests to HTTPS.

The IP certificate is a Let’s Encrypt `shortlived` certificate. It is valid for
about six days, so renewal is operationally mandatory rather than optional.
Certbot 5.4 is isolated at `/opt/certbot-ip`; the distribution Certbot 1.22
timer must remain disabled. Install and enable the dedicated units:

```bash
install -m 0644 deploy/systemd/studyroom-ip-cert-renew.service /etc/systemd/system/
install -m 0644 deploy/systemd/studyroom-ip-cert-renew.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now studyroom-ip-cert-renew.timer
```

Verify the public chain, redirect and renewal path after every Nginx or ACME
change:

```bash
curl --fail https://8.163.29.26/
curl --head http://8.163.29.26/
/opt/certbot-ip/bin/certbot renew --dry-run
systemctl list-timers studyroom-ip-cert-renew.timer
```

Do not add HSTS while the temporary IP entry and short-lived renewal path are
still being observed. The IP entry does not approve a V2 cutover or any
database migration.

When this temporary route is active, set the root-owned Phase 12 configuration
to `PUBLIC_ENTRY_MODE=ip` and `PUBLIC_IP=8.163.29.26`. The preflight then checks
the trusted HTTPS API entry instead of requiring the deferred domain to resolve.

## Phase 12 blue-green candidate

Phase 12 installs V2 alongside V1. V2 uses `127.0.0.1:8180`, candidate Nginx
uses `127.0.0.1:8280`, and its isolated Redis uses `127.0.0.1:6380`. No
candidate port may listen on a public interface.

The scripts in `scripts/` are fail-closed. With no action argument they only
print a preview. Mutating actions require both an explicit verb and the exact
`PHASE12_CONFIRM` value printed by the preview. Copy `phase12.conf.example` to
`/etc/studyroom/phase12.conf`, keep it owned by root with mode `0600`, and put
database credentials only in the root-owned MySQL defaults file referenced by
that config.

Typical candidate sequence:

```bash
sudo deploy/scripts/phase12-preflight.sh check
sudo deploy/scripts/inventory-before-v2.sh collect /opt/study-room/evidence/preflight.json
sudo env PHASE12_CONFIRM=BACKUP deploy/scripts/backup-before-v2.sh create
sudo env PHASE12_CONFIRM=BOOTSTRAP_V2 deploy/scripts/install-v2-release.sh bootstrap
sudo env PHASE12_CONFIRM=INSTALL_V2 deploy/scripts/install-v2-release.sh apply /srv/studyroom-v2/incoming/<release-id>
sudo deploy/scripts/verify-v2-candidate.sh check <full-git-sha>
```

The production Nginx template is not installed by candidate bootstrap because
it requires a verified ACME certificate. The maintenance window runbook must
be followed before installing it or switching the active links. Rollback
changes only the application upstream and Web link; database restore is never
automatic.
