-- Opt-in only. No content, invitation secrets or arbitrary response bodies are retained.
CREATE TABLE sr_create_receipt (
  owner_id BIGINT NOT NULL,
  operation_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_id BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (owner_id, operation_kind, request_id)
) ENGINE=InnoDB;
