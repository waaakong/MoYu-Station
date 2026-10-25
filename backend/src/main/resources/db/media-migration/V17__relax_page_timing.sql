-- NULL preserves the old online-minus-focus meaning; never backfill invented page evidence.
ALTER TABLE sr_activity_interval ADD COLUMN activity_kind VARCHAR(16) NULL;
ALTER TABLE sr_activity_day ADD COLUMN relax_ms BIGINT NULL;
