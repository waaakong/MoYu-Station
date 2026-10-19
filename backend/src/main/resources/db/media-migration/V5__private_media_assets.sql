-- Opt-in only: this directory is NOT in the application's default Flyway locations.
CREATE TABLE sr_media_asset (
  asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  client_upload_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  candidate_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  candidate_mime VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  failure_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at_ms BIGINT NOT NULL,
  processing_deadline_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  clear_mime VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  width INT NULL,
  height INT NULL,
  clear_bytes INT NULL,
  thumb_bytes INT NULL,
  UNIQUE KEY uk_media_owner_upload (owner_id, client_upload_id),
  KEY idx_media_expiry (state, expires_at_ms),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_id) REFERENCES sr_user(id),
  CONSTRAINT ck_media_state CHECK (state IN ('PROCESSING', 'READY', 'FAILED', 'RETRYABLE')),
  CONSTRAINT ck_media_expiry CHECK (expires_at_ms > created_at_ms),
  CONSTRAINT ck_media_ready CHECK (state <> 'READY' OR
    (clear_mime IN ('image/jpeg','image/png','image/webp') AND clear_mime IS NOT NULL
      AND width IS NOT NULL AND height IS NOT NULL AND clear_bytes IS NOT NULL AND thumb_bytes IS NOT NULL
      AND width > 0 AND height > 0 AND clear_bytes BETWEEN 1 AND 2097152 AND thumb_bytes BETWEEN 1 AND 2097152))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
