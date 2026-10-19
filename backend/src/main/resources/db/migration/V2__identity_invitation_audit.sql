ALTER TABLE sr_user
  ADD COLUMN force_password_change TINYINT NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN password_changed_at DATETIME NULL AFTER force_password_change;

CREATE TABLE sr_invitation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  label VARCHAR(100) NOT NULL,
  code_digest CHAR(64) NOT NULL,
  code_hint CHAR(4) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_by BIGINT NOT NULL,
  disabled_by BIGINT NULL,
  disabled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invitation_digest (code_digest),
  KEY idx_invitation_status_expiry (status, expires_at),
  KEY idx_invitation_creator (created_by, created_at),
  CONSTRAINT fk_invitation_creator FOREIGN KEY (created_by) REFERENCES sr_user(id),
  CONSTRAINT fk_invitation_disabler FOREIGN KEY (disabled_by) REFERENCES sr_user(id),
  CONSTRAINT chk_invitation_max_uses CHECK (max_uses BETWEEN 1 AND 100),
  CONSTRAINT chk_invitation_used_count CHECK (used_count BETWEEN 0 AND max_uses)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_invitation_redemption (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  invitation_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  source_ip_hash CHAR(64) NULL,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invitation_redemption_user (user_id),
  KEY idx_invitation_redemption_invite (invitation_id, redeemed_at),
  CONSTRAINT fk_invitation_redemption_invite FOREIGN KEY (invitation_id) REFERENCES sr_invitation(id),
  CONSTRAINT fk_invitation_redemption_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_admin_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NULL,
  action_code VARCHAR(64) NOT NULL,
  target_type VARCHAR(48) NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  result VARCHAR(24) NOT NULL,
  error_code VARCHAR(64) NULL,
  reason VARCHAR(300) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_audit_time (created_at),
  KEY idx_admin_audit_actor (actor_user_id, created_at),
  KEY idx_admin_audit_target (target_type, target_id, created_at),
  KEY idx_admin_audit_action (action_code, created_at),
  CONSTRAINT fk_admin_audit_actor FOREIGN KEY (actor_user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
