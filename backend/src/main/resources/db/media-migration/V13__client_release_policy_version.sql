-- Opt-in only; do not add this location to default production Flyway configuration.
ALTER TABLE sr_client_release ADD COLUMN policy_version BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_client_release_admin_page ON sr_client_release(created_at, id);
