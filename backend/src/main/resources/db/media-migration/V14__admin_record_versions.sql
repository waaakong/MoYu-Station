-- Opt-in versioned user/feedback administration; old application entity reads remain compatible.
ALTER TABLE sr_user ADD COLUMN admin_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sr_feedback ADD COLUMN admin_version BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_admin_user_page ON sr_user(deleted, created_at, id);
CREATE INDEX idx_admin_feedback_page ON sr_feedback(created_at, id);
