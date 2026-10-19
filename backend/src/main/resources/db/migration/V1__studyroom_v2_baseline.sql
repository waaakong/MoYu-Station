CREATE TABLE sr_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  user_type VARCHAR(24) NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL, MUTED, BANNED, ADMIN',
  online_status VARCHAR(24) NOT NULL DEFAULT 'OFFLINE' COMMENT 'FOCUSING, PLAYING, IDLE, OFFLINE',
  ban_reason VARCHAR(255) NULL,
  level INT NOT NULL DEFAULT 0,
  exp INT NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  last_active_at DATETIME NULL,
  login_version VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_user_username (username),
  KEY idx_user_type (user_type),
  KEY idx_user_status (online_status),
  KEY idx_user_last_active_at (last_active_at),
  KEY idx_user_login_version (login_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_scene (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(500) NOT NULL,
  image_map_json JSON NOT NULL,
  built_in TINYINT NOT NULL DEFAULT 1,
  enabled TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_scene_code (code),
  KEY idx_scene_enabled (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_user_scene_upload (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  scene_name VARCHAR(64) NOT NULL,
  thumb_path VARCHAR(500) NULL,
  image_map_json JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user_scene_user (user_id, created_at),
  CONSTRAINT fk_user_scene_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_focus_record (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  client_record_id VARCHAR(64) NULL,
  scene_code VARCHAR(64) NOT NULL,
  time_key VARCHAR(24) NOT NULL,
  planned_minutes INT NOT NULL,
  actual_minutes INT NOT NULL DEFAULT 0,
  actual_seconds INT NOT NULL DEFAULT 0,
  state VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_focus_user_time (user_id, started_at),
  KEY idx_focus_scene (scene_code, time_key),
  UNIQUE KEY uk_focus_client_record (user_id, client_record_id),
  CONSTRAINT fk_focus_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_checkin_record (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  checkin_date DATE NOT NULL,
  draw_type VARCHAR(24) NOT NULL,
  title VARCHAR(100) NOT NULL,
  explanation TEXT NOT NULL,
  exp_added INT NOT NULL DEFAULT 1,
  level_after INT NOT NULL,
  exp_after INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_checkin_user_date (user_id, checkin_date),
  KEY idx_checkin_user (user_id, created_at),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_user_audio (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user_audio_user (user_id, created_at),
  CONSTRAINT fk_user_audio_user FOREIGN KEY (user_id) REFERENCES sr_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_post (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  client_request_id VARCHAR(64) NULL,
  content TEXT NOT NULL,
  scene_code VARCHAR(64) NULL,
  image_urls_json JSON NULL,
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  deleted_by_user TINYINT NOT NULL DEFAULT 0,
  deleted_by_admin TINYINT NOT NULL DEFAULT 0,
  delete_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_post_client_request (user_id, client_request_id),
  KEY idx_post_user (user_id, created_at),
  KEY idx_post_visible (deleted_by_user, deleted_by_admin, created_at),
  CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_post_comment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  reply_to_user_id BIGINT NULL,
  content TEXT NOT NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_comment_post (post_id, created_at),
  KEY idx_comment_user (user_id, created_at),
  KEY idx_comment_reply_user (reply_to_user_id, created_at),
  CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES sr_post(id),
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES sr_user(id),
  CONSTRAINT fk_comment_reply_user FOREIGN KEY (reply_to_user_id) REFERENCES sr_user(id),
  CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES sr_post_comment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_post_like (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_post_like (post_id, user_id),
  KEY idx_like_user (user_id, created_at),
  CONSTRAINT fk_like_post FOREIGN KEY (post_id) REFERENCES sr_post(id),
  CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_feedback (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  feedback_type VARCHAR(32) NOT NULL DEFAULT 'SUGGESTION',
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  admin_reply TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_feedback_status (status, created_at),
  KEY idx_feedback_user (user_id, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_private_conversation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_a_id BIGINT NOT NULL,
  user_b_id BIGINT NOT NULL,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_private_pair (user_a_id, user_b_id),
  CONSTRAINT fk_conversation_user_a FOREIGN KEY (user_a_id) REFERENCES sr_user(id),
  CONSTRAINT fk_conversation_user_b FOREIGN KEY (user_b_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_chat_message (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  conversation_id BIGINT NULL,
  sender_id BIGINT NOT NULL,
  receiver_id BIGINT NULL,
  channel_type VARCHAR(24) NOT NULL,
  message_type VARCHAR(24) NOT NULL DEFAULT 'TEXT',
  content TEXT NULL,
  media_url VARCHAR(500) NULL,
  voice_seconds INT NULL,
  read_at DATETIME NULL,
  recalled_at DATETIME NULL,
  recalled_by_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_hall (channel_type, created_at),
  KEY idx_chat_private (conversation_id, created_at),
  KEY idx_chat_receiver (receiver_id, read_at),
  CONSTRAINT fk_chat_conversation FOREIGN KEY (conversation_id) REFERENCES sr_private_conversation(id),
  CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES sr_user(id),
  CONSTRAINT fk_chat_receiver FOREIGN KEY (receiver_id) REFERENCES sr_user(id),
  CONSTRAINT fk_chat_recalled_by FOREIGN KEY (recalled_by_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_chat_message_visibility (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  message_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  hidden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chat_message_visibility (message_id, user_id),
  KEY idx_chat_visibility_user (user_id, hidden_at),
  CONSTRAINT fk_chat_visibility_message FOREIGN KEY (message_id) REFERENCES sr_chat_message(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_visibility_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_daily_stat (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  stat_date DATE NOT NULL,
  focus_minutes INT NOT NULL DEFAULT 0,
  slack_minutes INT NOT NULL DEFAULT 0,
  online_minutes INT NOT NULL DEFAULT 0,
  fake_effort_index DECIMAL(8,2) NOT NULL DEFAULT 0,
  favorite_scene_code VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_daily_user_date (user_id, stat_date),
  KEY idx_daily_user (user_id, stat_date),
  CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_todo (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  completed TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_todo_user (user_id, completed, created_at),
  CONSTRAINT fk_todo_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_note (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_note_user (user_id, updated_at),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_client_update_membership (
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

CREATE TABLE sr_client_release (
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

CREATE TABLE sr_client_update_audit (
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

INSERT INTO sr_scene (code, name, description, thumb_path, image_map_json, sort_order)
VALUES
  ('mountain', '高山湖泊', '山体、湖面倒影和远处天光。', 'scenes/mountain/morning.png', JSON_OBJECT('morning','scenes/mountain/morning.png','forenoon','scenes/mountain/forenoon.png','noon','scenes/mountain/noon.png','afternoon','scenes/mountain/afternoon.png','dusk','scenes/mountain/dusk.png','night','scenes/mountain/night.png','midnight','scenes/mountain/midnight.png'), 10),
  ('beach', '海边沙滩', '浅海、白沙和晴朗天光。', 'scenes/beach/morning.png', JSON_OBJECT('morning','scenes/beach/morning.png','forenoon','scenes/beach/forenoon.png','noon','scenes/beach/noon.png','afternoon','scenes/beach/afternoon.png','dusk','scenes/beach/dusk.png','night','scenes/beach/night.png','midnight','scenes/beach/midnight.png'), 20),
  ('forest', '森林', '树影、雾气和穿林高光。', 'scenes/forest/morning.png', JSON_OBJECT('morning','scenes/forest/morning.png','forenoon','scenes/forest/forenoon.png','noon','scenes/forest/noon.png','afternoon','scenes/forest/afternoon.png','dusk','scenes/forest/dusk.png','night','scenes/forest/night.png','midnight','scenes/forest/midnight.png'), 30),
  ('library', '图书馆', '高书架、暖灯和安静秩序。', 'scenes/library/morning.png', JSON_OBJECT('morning','scenes/library/morning.png','forenoon','scenes/library/forenoon.png','noon','scenes/library/noon.png','afternoon','scenes/library/afternoon.png','dusk','scenes/library/dusk.png','night','scenes/library/night.png','midnight','scenes/library/midnight.png'), 40),
  ('cafe', '雨天咖啡馆', '窗边雨痕、咖啡香和室内暖光。', 'scenes/cafe/morning.png', JSON_OBJECT('morning','scenes/cafe/morning.png','forenoon','scenes/cafe/forenoon.png','noon','scenes/cafe/noon.png','afternoon','scenes/cafe/afternoon.png','dusk','scenes/cafe/dusk.png','night','scenes/cafe/night.png','midnight','scenes/cafe/midnight.png'), 50),
  ('snow-window', '雪山窗边', '窗外山雪和室内静光。', 'scenes/snow-window/morning.png', JSON_OBJECT('morning','scenes/snow-window/morning.png','forenoon','scenes/snow-window/forenoon.png','noon','scenes/snow-window/noon.png','afternoon','scenes/snow-window/afternoon.png','dusk','scenes/snow-window/dusk.png','night','scenes/snow-window/night.png','midnight','scenes/snow-window/midnight.png'), 60)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  thumb_path = VALUES(thumb_path),
  image_map_json = VALUES(image_map_json),
  sort_order = VALUES(sort_order),
  updated_at = CURRENT_TIMESTAMP;

INSERT IGNORE INTO sr_client_update_membership (user_id, channel, enabled, granted_by)
SELECT id, channel_name, 1, id
FROM sr_user
CROSS JOIN (
  SELECT 'stable' AS channel_name
  UNION ALL SELECT 'beta'
  UNION ALL SELECT 'provider-experimental'
) channels
WHERE deleted = 0 AND UPPER(user_type) = 'ADMIN';
