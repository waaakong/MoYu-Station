-- Opt-in only; apply only through an explicitly approved migration workflow.
-- Published assets can retire once all references have gone. Preserve publication
-- timestamps and request receipts: collection must never make an asset reusable.
ALTER TABLE sr_media_asset
  DROP CHECK ck_media_lifecycle,
  ADD COLUMN unreferenced_at_ms BIGINT NULL,
  ADD COLUMN collected_at_ms BIGINT NULL,
  ADD KEY idx_media_collection (collected_at_ms, retired_at_ms, expires_at_ms),
  ADD CONSTRAINT ck_media_collected CHECK (collected_at_ms IS NULL OR retired_at_ms IS NOT NULL);
