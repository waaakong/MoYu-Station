DELIMITER //

CREATE PROCEDURE sr_apply_legacy_schema_compatibility()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_focus_record' AND COLUMN_NAME = 'client_record_id'
  ) THEN
    ALTER TABLE sr_focus_record ADD COLUMN client_record_id VARCHAR(64) NULL AFTER user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_focus_record' AND COLUMN_NAME = 'actual_seconds'
  ) THEN
    ALTER TABLE sr_focus_record ADD COLUMN actual_seconds INT NOT NULL DEFAULT 0 AFTER actual_minutes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_focus_record' AND INDEX_NAME = 'uk_focus_client_record'
  ) THEN
    ALTER TABLE sr_focus_record ADD UNIQUE KEY uk_focus_client_record (user_id, client_record_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_post' AND COLUMN_NAME = 'client_request_id'
  ) THEN
    ALTER TABLE sr_post ADD COLUMN client_request_id VARCHAR(64) NULL AFTER user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_post' AND INDEX_NAME = 'uk_post_client_request'
  ) THEN
    ALTER TABLE sr_post ADD UNIQUE KEY uk_post_client_request (user_id, client_request_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_chat_message'
      AND CONSTRAINT_NAME = 'fk_chat_recalled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE sr_chat_message
      ADD CONSTRAINT fk_chat_recalled_by FOREIGN KEY (recalled_by_id) REFERENCES sr_user(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sr_post_comment'
      AND CONSTRAINT_NAME = 'fk_comment_reply_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE sr_post_comment
      ADD CONSTRAINT fk_comment_reply_user FOREIGN KEY (reply_to_user_id) REFERENCES sr_user(id);
  END IF;
END//

CALL sr_apply_legacy_schema_compatibility()//
DROP PROCEDURE sr_apply_legacy_schema_compatibility//

DELIMITER ;

ALTER TABLE sr_chat_message
  MODIFY COLUMN channel_type VARCHAR(24) NOT NULL COMMENT 'HALL, PRIVATE',
  MODIFY COLUMN message_type VARCHAR(24) NOT NULL DEFAULT 'TEXT' COMMENT 'TEXT, IMAGE, VOICE';

ALTER TABLE sr_checkin_record
  MODIFY COLUMN draw_type VARCHAR(24) NOT NULL COMMENT 'FORTUNE, TAROT';

ALTER TABLE sr_feedback
  MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, PROCESSING, RECORDED, RESOLVED';

ALTER TABLE sr_focus_record
  MODIFY COLUMN time_key VARCHAR(24) NOT NULL COMMENT 'morning, forenoon, noon, afternoon, dusk, night, midnight',
  MODIFY COLUMN state VARCHAR(24) NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING, PAUSED, COMPLETED, CANCELED';

ALTER TABLE sr_user
  MODIFY COLUMN online_status VARCHAR(24) NOT NULL DEFAULT 'OFFLINE' COMMENT 'FOCUSING, PLAYING, IDLE, OFFLINE';

ALTER TABLE sr_user_scene_upload
  MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT, READY, DISABLED';

CREATE TABLE IF NOT EXISTS sr_client_update_membership (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  channel VARCHAR(32) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  granted_by BIGINT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  UNIQUE KEY uk_client_update_member (user_id, channel),
  KEY idx_client_update_channel (channel, enabled),
  CONSTRAINT fk_client_update_member_user FOREIGN KEY (user_id) REFERENCES sr_user(id),
  CONSTRAINT fk_client_update_member_granter FOREIGN KEY (granted_by) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sr_client_release (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id VARCHAR(64) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  version VARCHAR(64) NOT NULL,
  platform VARCHAR(24) NOT NULL,
  arch VARCHAR(24) NOT NULL,
  app_id VARCHAR(120) NOT NULL,
  artifact_key VARCHAR(180) NOT NULL,
  manifest_json LONGTEXT NOT NULL,
  manifest_signature TEXT NOT NULL,
  manifest_key_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  rollout_percentage INT NOT NULL DEFAULT 0,
  mandatory TINYINT NOT NULL DEFAULT 0,
  minimum_supported_version VARCHAR(64) NULL,
  release_notes TEXT NULL,
  release_salt VARCHAR(64) NOT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_client_release_id (release_id),
  UNIQUE KEY uk_client_release_version (channel, version, platform, arch),
  KEY idx_client_release_offer (channel, platform, arch, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sr_client_update_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(48) NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  before_json TEXT NULL,
  after_json TEXT NULL,
  reason VARCHAR(300) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_client_update_audit_time (created_at),
  KEY idx_client_update_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_client_update_audit_actor FOREIGN KEY (actor_user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO sr_client_update_membership (user_id, channel, enabled, granted_by)
SELECT id, channel_name, 1, id
FROM sr_user
CROSS JOIN (
  SELECT 'stable' AS channel_name
  UNION ALL SELECT 'beta'
  UNION ALL SELECT 'provider-experimental'
) channels
WHERE deleted = 0 AND UPPER(user_type) = 'ADMIN';
