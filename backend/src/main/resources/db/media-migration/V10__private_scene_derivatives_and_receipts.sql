-- Opt-in only. Execute on fresh isolated databases / test copies, never implicitly in production.
ALTER TABLE sr_media_asset ADD COLUMN display_bytes INT NULL,
  DROP CHECK ck_media_ready_v8,
  ADD CONSTRAINT ck_media_ready_v10 CHECK (state <> 'READY' OR
    (clear_mime IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND clear_bytes IS NOT NULL AND thumb_bytes IS NOT NULL
     AND width > 0 AND height > 0 AND clear_bytes > 0 AND thumb_bytes BETWEEN 1 AND 2097152 AND
      ((purpose='social' AND clear_mime IN ('image/jpeg','image/png','image/webp') AND clear_bytes<=2097152 AND display_bytes IS NULL)
       OR (purpose='sticker' AND clear_mime IN ('image/jpeg','image/png','image/webp','image/gif') AND width<=512 AND height<=512 AND clear_bytes<=5242880 AND display_bytes IS NULL)
       OR (purpose='scene' AND clear_mime='image/png' AND width<=4096 AND height<=4096 AND clear_bytes<=8388608 AND display_bytes IS NOT NULL AND display_bytes BETWEEN 1 AND 2097152))));

CREATE TABLE sr_custom_scene_receipt (
  owner_id BIGINT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version BIGINT NOT NULL,
  deleted TINYINT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY(owner_id,request_id),
  CONSTRAINT fk_scene_receipt_owner FOREIGN KEY(owner_id) REFERENCES sr_user(id),
  CONSTRAINT ck_scene_receipt_deleted CHECK(deleted IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
