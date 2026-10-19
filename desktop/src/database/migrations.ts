export interface DatabaseMigration {
  version: number;
  name: string;
  sql: string;
}

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: "initial local-first schema",
    sql: `
      CREATE TABLE IF NOT EXISTS library_tracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration_ms INTEGER,
        artwork_url TEXT,
        source_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_locations (
        track_id TEXT PRIMARY KEY REFERENCES library_tracks(id) ON DELETE CASCADE,
        file_token TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL,
        last_seen_at INTEGER NOT NULL,
        missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS queue_items (
        position INTEGER PRIMARY KEY,
        queue_item_id TEXT NOT NULL UNIQUE,
        track_json TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        track_id TEXT NOT NULL REFERENCES library_tracks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, track_id)
      );

      CREATE TABLE IF NOT EXISTS playback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS favorite_tracks (
        track_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sound_snapshots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mixer_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS device_settings (
        setting_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS focus_records (
        client_record_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        planned_minutes INTEGER NOT NULL,
        completed_minutes INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'canceled')),
        sync_status TEXT NOT NULL CHECK (sync_status IN ('local', 'pending', 'synced', 'failed')),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todo_items (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entertainment_state (
        tool_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL
      );
    `
  },
  {
    version: 2,
    name: "local query indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_library_tracks_title ON library_tracks(title);
      CREATE INDEX IF NOT EXISTS idx_library_tracks_artist ON library_tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_history_played_at ON playback_history(played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_focus_sync_status ON focus_records(sync_status, updated_at);
    `
  },
  {
    version: 3,
    name: "store private local media locations",
    sql: `
      ALTER TABLE file_locations ADD COLUMN local_path TEXT;
      ALTER TABLE file_locations ADD COLUMN file_size INTEGER;
      ALTER TABLE file_locations ADD COLUMN modified_at INTEGER;
      CREATE INDEX IF NOT EXISTS idx_file_locations_path ON file_locations(local_path);
      CREATE INDEX IF NOT EXISTS idx_file_locations_fingerprint ON file_locations(fingerprint);
    `
  },
  {
    version: 4,
    name: "index local metadata and reconciliation state",
    sql: `
      ALTER TABLE file_locations ADD COLUMN root_path TEXT;
      ALTER TABLE file_locations ADD COLUMN artwork_token TEXT;
      ALTER TABLE file_locations ADD COLUMN artwork_path TEXT;
      ALTER TABLE file_locations ADD COLUMN artwork_mime TEXT;
      ALTER TABLE file_locations ADD COLUMN lyrics_text TEXT;
      ALTER TABLE file_locations ADD COLUMN lyrics_source TEXT CHECK (lyrics_source IN ('embedded', 'sidecar'));
      CREATE INDEX IF NOT EXISTS idx_file_locations_root_missing ON file_locations(root_path, missing);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_file_locations_artwork_token ON file_locations(artwork_token) WHERE artwork_token IS NOT NULL;
    `
  },
  {
    version: 5,
    name: "multi-location library roots and playback history",
    sql: `
      ALTER TABLE library_tracks ADD COLUMN media_token TEXT;
      UPDATE library_tracks
      SET media_token = (SELECT file_token FROM file_locations WHERE file_locations.track_id = library_tracks.id)
      WHERE EXISTS (SELECT 1 FROM file_locations WHERE file_locations.track_id = library_tracks.id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_library_tracks_media_token
        ON library_tracks(media_token) WHERE media_token IS NOT NULL;

      CREATE TABLE library_roots (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        local_path TEXT NOT NULL UNIQUE,
        watch_enabled INTEGER NOT NULL DEFAULT 0 CHECK (watch_enabled IN (0, 1)),
        watch_state TEXT NOT NULL DEFAULT 'off' CHECK (watch_state IN ('off', 'watching', 'attention')),
        last_scan_at INTEGER
      );

      ALTER TABLE file_locations RENAME TO file_locations_v4;
      CREATE TABLE file_locations (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES library_tracks(id) ON DELETE CASCADE,
        local_path TEXT NOT NULL UNIQUE,
        root_id TEXT REFERENCES library_roots(id) ON DELETE SET NULL,
        quick_signature TEXT,
        content_hash TEXT,
        last_seen_at INTEGER NOT NULL,
        missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1)),
        file_size INTEGER,
        modified_at INTEGER,
        artwork_token TEXT,
        artwork_path TEXT,
        artwork_mime TEXT,
        lyrics_text TEXT,
        lyrics_source TEXT CHECK (lyrics_source IN ('embedded', 'sidecar'))
      );
      INSERT INTO file_locations(
        id, track_id, local_path, quick_signature, last_seen_at, missing, file_size, modified_at,
        artwork_token, artwork_path, artwork_mime, lyrics_text, lyrics_source
      )
      SELECT
        lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) ||
        '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
        track_id, local_path, NULL, last_seen_at, missing, file_size, modified_at,
        artwork_token, artwork_path, artwork_mime, lyrics_text, lyrics_source
      FROM file_locations_v4 WHERE local_path IS NOT NULL;
      DROP TABLE file_locations_v4;

      CREATE INDEX idx_file_locations_track_available ON file_locations(track_id, missing, last_seen_at DESC);
      CREATE INDEX idx_file_locations_root_missing ON file_locations(root_id, missing);
      CREATE INDEX idx_file_locations_quick_signature ON file_locations(quick_signature, file_size);
      CREATE INDEX idx_file_locations_content_hash ON file_locations(content_hash);
      CREATE INDEX idx_file_locations_artwork_token ON file_locations(artwork_token) WHERE artwork_token IS NOT NULL;

      ALTER TABLE playback_history ADD COLUMN session_id TEXT;
      CREATE UNIQUE INDEX idx_history_session_id ON playback_history(session_id) WHERE session_id IS NOT NULL;
      CREATE INDEX idx_history_track_played ON playback_history(track_id, played_at DESC);
    `
  },
  {
    version: 6,
    name: "track lyric offsets",
    sql: `
      CREATE TABLE track_lyric_offsets (
        track_id TEXT PRIMARY KEY REFERENCES library_tracks(id) ON DELETE CASCADE,
        offset_ms INTEGER NOT NULL CHECK (offset_ms BETWEEN -10000 AND 10000),
        updated_at INTEGER NOT NULL
      );
    `
  },
  {
    version: 7,
    name: "provider metadata and radio catalog cache",
    sql: `
      CREATE TABLE provider_metadata_cache (
        provider_id TEXT NOT NULL CHECK (provider_id IN ('netease', 'qq', 'kugou')),
        account_scope_hash TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        PRIMARY KEY (provider_id, account_scope_hash, cache_key)
      );
      CREATE INDEX idx_provider_cache_expiry ON provider_metadata_cache(expires_at, accessed_at);

      CREATE TABLE radio_catalog_cache (
        station_id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_radio_cache_expiry ON radio_catalog_cache(expires_at, accessed_at);
    `
  },
  {
    version: 8,
    name: "local-first focus records and workspace scopes",
    sql: `
      ALTER TABLE focus_records ADD COLUMN completed_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE focus_records ADD COLUMN scene_code TEXT NOT NULL DEFAULT 'mountain';
      ALTER TABLE focus_records ADD COLUMN time_key TEXT NOT NULL DEFAULT 'morning';
      ALTER TABLE focus_records ADD COLUMN sync_policy TEXT NOT NULL DEFAULT 'manual-only'
        CHECK (sync_policy IN ('automatic', 'manual-only'));
      ALTER TABLE focus_records ADD COLUMN account_scope TEXT;
      ALTER TABLE focus_records ADD COLUMN cloud_record_id INTEGER;
      ALTER TABLE focus_records ADD COLUMN sync_error TEXT;
      CREATE INDEX idx_focus_policy_time ON focus_records(sync_policy, started_at DESC);

      CREATE TABLE focus_workspaces (
        account_scope TEXT PRIMARY KEY,
        workspace_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  }
  ,{
    version: 9,
    name: "focus activity ledger linkage",
    sql: `ALTER TABLE focus_records ADD COLUMN activity_session_id TEXT;`
  }
] as const;

export const LATEST_DATABASE_VERSION = DATABASE_MIGRATIONS.at(-1)?.version ?? 0;
