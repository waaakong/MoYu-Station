CREATE TABLE sr_activity_owner (
  user_id BIGINT NOT NULL PRIMARY KEY,
  first_date DATE NOT NULL
) ENGINE=InnoDB;
CREATE TABLE sr_activity_stream (
  user_id BIGINT NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_sequence BIGINT NOT NULL DEFAULT 0,
  last_end_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,session_id)
) ENGINE=InnoDB;
CREATE TABLE sr_activity_receipt (
  user_id BIGINT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence_no BIGINT NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY(user_id,request_id),
  UNIQUE KEY uk_activity_sequence(user_id,session_id,sequence_no)
) ENGINE=InnoDB;
CREATE TABLE sr_activity_interval (
  user_id BIGINT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ordinal_no INT NOT NULL,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  focusing TINYINT NOT NULL,
  PRIMARY KEY(user_id,request_id,ordinal_no),
  KEY idx_activity_day(user_id,start_ms,end_ms),
  KEY idx_activity_overlap(user_id,end_ms,start_ms)
) ENGINE=InnoDB;
CREATE TABLE sr_activity_day (
  user_id BIGINT NOT NULL,
  stat_date DATE NOT NULL,
  online_ms BIGINT NOT NULL DEFAULT 0,
  focus_ms BIGINT NOT NULL DEFAULT 0,
  partial TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,stat_date)
) ENGINE=InnoDB;
CREATE TABLE sr_activity_focus_link (
  user_id BIGINT NOT NULL,
  client_record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stat_date DATE NOT NULL,
  minutes INT NOT NULL,
  PRIMARY KEY(user_id,client_record_id),
  KEY idx_activity_focus_day(user_id,stat_date)
) ENGINE=InnoDB;
