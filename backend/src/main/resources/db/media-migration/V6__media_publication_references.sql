-- Opt-in only. Existing media files and business rows are not rewritten or removed.
ALTER TABLE sr_media_asset
  ADD COLUMN published_at_ms BIGINT NULL,
  ADD COLUMN retired_at_ms BIGINT NULL,
  ADD CONSTRAINT ck_media_lifecycle CHECK (published_at_ms IS NULL OR retired_at_ms IS NULL);

CREATE TABLE sr_media_publication (
  owner_id BIGINT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  target_id BIGINT NULL,
  PRIMARY KEY (owner_id, request_id),
  CONSTRAINT fk_media_publication_owner FOREIGN KEY (owner_id) REFERENCES sr_user(id),
  CONSTRAINT ck_media_publication_kind CHECK (kind IN ('POST','HALL','PRIVATE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sr_media_reference (
  asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  post_id BIGINT NULL,
  message_id BIGINT NULL,
  position INT NOT NULL,
  UNIQUE KEY uk_media_post_position (post_id, position),
  UNIQUE KEY uk_media_message_position (message_id, position),
  CONSTRAINT fk_media_reference_asset FOREIGN KEY (asset_id) REFERENCES sr_media_asset(asset_id),
  CONSTRAINT fk_media_reference_post FOREIGN KEY (post_id) REFERENCES sr_post(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_reference_message FOREIGN KEY (message_id) REFERENCES sr_chat_message(id) ON DELETE CASCADE,
  CONSTRAINT ck_media_reference_target CHECK ((post_id IS NULL) <> (message_id IS NULL)),
  CONSTRAINT ck_media_reference_position CHECK (position BETWEEN 0 AND 8 AND (message_id IS NULL OR position=0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
