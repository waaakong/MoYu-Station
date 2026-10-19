-- Opt-in, fresh isolated databases first. Never rewrite V1-V7 or historical files.
ALTER TABLE sr_media_asset ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'social',
  ADD CONSTRAINT ck_media_purpose CHECK (purpose IN ('social','sticker','scene')),
  DROP CHECK ck_media_ready,
  ADD CONSTRAINT ck_media_ready_v8 CHECK (state <> 'READY' OR
    (clear_mime IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND clear_bytes IS NOT NULL AND thumb_bytes IS NOT NULL
      AND width > 0 AND height > 0 AND thumb_bytes BETWEEN 1 AND 2097152 AND
      ((purpose IN ('social','scene') AND clear_mime IN ('image/jpeg','image/png','image/webp') AND clear_bytes BETWEEN 1 AND 2097152)
       OR (purpose='sticker' AND clear_mime IN ('image/jpeg','image/png','image/webp','image/gif') AND width<=512 AND height<=512 AND clear_bytes BETWEEN 1 AND 5242880))));

CREATE TABLE sr_sticker_collection (
  owner_id BIGINT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_sticker_collection_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE sr_sticker_favorite (
  favorite_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  source_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position INT NOT NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  KEY idx_sticker_owner_order(owner_id,deleted,position,favorite_id),
  CONSTRAINT fk_sticker_favorite_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id),
  CONSTRAINT fk_sticker_favorite_asset FOREIGN KEY(asset_id) REFERENCES sr_media_asset(asset_id),
  CONSTRAINT ck_sticker_deleted CHECK(deleted IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sr_custom_scene (
  owner_id BIGINT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  deleted TINYINT NOT NULL DEFAULT 1,
  config_json JSON NULL,
  CONSTRAINT fk_custom_scene_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id),
  CONSTRAINT ck_custom_scene_deleted CHECK(deleted IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE sr_media_reference
  DROP PRIMARY KEY,
  ADD COLUMN reference_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD KEY idx_media_reference_asset(asset_id),
  ADD COLUMN favorite_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN scene_owner_id BIGINT NULL,
  ADD UNIQUE KEY uk_media_favorite(favorite_id),
  ADD UNIQUE KEY uk_media_scene_position(scene_owner_id,position),
  ADD CONSTRAINT fk_media_reference_favorite FOREIGN KEY(favorite_id) REFERENCES sr_sticker_favorite(favorite_id),
  ADD CONSTRAINT fk_media_reference_scene FOREIGN KEY(scene_owner_id) REFERENCES sr_custom_scene(owner_id),
  DROP CHECK ck_media_reference_target,
  ADD CONSTRAINT ck_media_reference_target_v8 CHECK
    ((post_id IS NOT NULL)+(message_id IS NOT NULL)+(favorite_id IS NOT NULL)+(scene_owner_id IS NOT NULL)=1);
