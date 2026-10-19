ALTER TABLE sr_invitation ADD COLUMN admin_version BIGINT NOT NULL DEFAULT 0;
CREATE INDEX idx_invitation_created_id ON sr_invitation(created_at,id);
ALTER TABLE sr_client_update_membership ADD COLUMN admin_version BIGINT NOT NULL DEFAULT 0;
