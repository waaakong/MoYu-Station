import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  unlinkSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {CLASSIC_GAME_IDS,isClassicGame} from '@studyroom/contracts';
import { DatabaseSync } from "node:sqlite";
import type {
  FocusRecordDraft,
  FocusRecordListRequest,
  FocusWorkspace,
  EntertainmentState,
  EntertainmentStateId,
  EntertainmentStateRecord,
  LocalPlaylistItem,
  LocalPlaylistSummary,
  LibraryRootSummary,
  MissingTrack,
  PlaybackHistoryEvent,
  QueueItem,
  SoundSettings,
  SoundSnapshot,
  Track,
  TrackLyrics
} from "@studyroom/contracts";
import { DATABASE_MIGRATIONS, type DatabaseMigration } from "./migrations";
import type { ScannedAudioFile } from "../audio/library/scanner";

const MAX_QUEUE_ITEMS = 10_000;
const MAX_TRACK_ROWS = 50_000;
const MAX_HISTORY_ROWS = 10_000;
const MAX_PLAYLISTS = 200;
const MAX_PLAYLIST_TRACKS = 10_000;
const MAX_SOUND_SNAPSHOTS = 20;
const SOUND_SETTINGS_KEY = "sound-center-v1";
const MAX_CACHE_JSON_BYTES = 256 * 1024;
const MAX_FOCUS_RECORDS = 10_000;
const MAX_FOCUS_WORKSPACE_BYTES = 64 * 1024;
const MAX_ENTERTAINMENT_STATE_BYTES = 32 * 1024;

export interface MetadataCacheRecord<T> {
  value: T;
  expiresAt: number;
  stale: boolean;
}

function safeCacheJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, "utf8") > MAX_CACHE_JSON_BYTES) throw new Error("CACHE_ENTRY_TOO_LARGE");
  if (/https?:\/\//i.test(json)) throw new Error("CACHE_REMOTE_URL_REJECTED");
  if (/"(?:authorization|cookie|credential|password|access_?token|refresh_?token|headers)"\s*:/i.test(json)) {
    throw new Error("CACHE_PRIVATE_FIELD_REJECTED");
  }
  return json;
}

export interface LibraryRootEntry extends LibraryRootSummary { localPath: string }

export interface LocationCandidate {
  id: string;
  trackId: string;
  path: string;
  contentHash?: string;
  createdAt: number;
  size?: number;
  modifiedAt?: number;
}

export interface LocationUpsertResult {
  status: "imported" | "updated" | "added-location";
  trackId: string;
}

export interface LocalProfileCounts {
  trackCount: number;
  queueItemCount: number;
  playlistCount: number;
  focusRecordCount: number;
  latestFocusAt?: number;
  hasEntertainmentSettings: boolean;
}

function rowToTrack(row: Record<string, unknown>): Track {
  return {
    id: String(row.id),
    title: String(row.title),
    artist: String(row.artist),
    album: row.album == null ? undefined : String(row.album),
    durationMs: row.duration_ms == null ? undefined : Number(row.duration_ms),
    artworkUrl: row.artwork_url == null ? undefined : String(row.artwork_url),
    source: JSON.parse(String(row.source_json)) as Track["source"]
  };
}

export class DatabaseRecoveryRequiredError extends Error {
  constructor(message: string, readonly backupPath?: string) {
    super(message);
    this.name = "DatabaseRecoveryRequiredError";
  }
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

function safeBackupName(databasePath: string, now: number): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  return `${basename(databasePath)}.${stamp}.backup`;
}

function pruneBackups(backupDirectory: string, databasePath: string, keep = 3): void {
  const prefix = `${basename(databasePath)}.`;
  const entries = readdirSync(backupDirectory)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".backup"))
    .sort()
    .reverse();

  for (const name of entries.slice(keep)) {
    const target = resolve(backupDirectory, name);
    if (dirname(target) !== resolve(backupDirectory)) continue;
    unlinkSync(target);
  }
}

export interface InitializeDatabaseOptions {
  migrations?: readonly DatabaseMigration[];
  now?: () => number;
}

export interface InitializedDatabase {
  database: DatabaseSync;
  backupPath?: string;
  schemaVersion: number;
}

export function initializeLocalDatabase(
  databasePath: string,
  options: InitializeDatabaseOptions = {}
): InitializedDatabase {
  const migrations = [...(options.migrations ?? DATABASE_MIGRATIONS)].sort((a, b) => a.version - b.version);
  const latestVersion = migrations.at(-1)?.version ?? 0;
  const now = options.now ?? Date.now;
  const databaseDirectory = dirname(databasePath);
  const backupDirectory = join(databaseDirectory, "backups");
  mkdirSync(databaseDirectory, { recursive: true });

  const existed = existsSync(databasePath) && statSync(databasePath).size > 0;
  let currentVersion = 0;
  if (existed) {
    let probe: DatabaseSync | undefined;
    try {
      probe = new DatabaseSync(databasePath);
      currentVersion = readUserVersion(probe);
    } catch {
      probe?.close();
      probe = undefined;
      mkdirSync(backupDirectory, { recursive: true });
      const corruptedBackup = join(backupDirectory, safeBackupName(databasePath, now()));
      copyFileSync(databasePath, corruptedBackup);
      throw new DatabaseRecoveryRequiredError("本机数据库无法读取，原文件已保留", corruptedBackup);
    } finally {
      probe?.close();
    }
  }

  if (currentVersion > latestVersion) {
    mkdirSync(backupDirectory, { recursive: true });
    const futureBackup = join(backupDirectory, safeBackupName(databasePath, now()));
    copyFileSync(databasePath, futureBackup);
    throw new DatabaseRecoveryRequiredError("本机数据库版本高于当前客户端，已阻止降级写入", futureBackup);
  }

  let backupPath: string | undefined;
  if (existed && currentVersion < latestVersion) {
    mkdirSync(backupDirectory, { recursive: true });
    backupPath = join(backupDirectory, safeBackupName(databasePath, now()));
    copyFileSync(databasePath, backupPath);
  }

  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    if (currentVersion < latestVersion) {
      database.exec("BEGIN IMMEDIATE");
      for (const migration of migrations) {
        if (migration.version <= currentVersion) continue;
        if (migration.version !== currentVersion + 1) {
          throw new Error(`Migration sequence is incomplete at version ${currentVersion + 1}`);
        }
        database.exec(migration.sql);
        database.exec(`PRAGMA user_version = ${migration.version}`);
        database.prepare(
          "INSERT OR REPLACE INTO app_meta(meta_key, meta_value) VALUES ('schema_version', ?)"
        ).run(String(migration.version));
        currentVersion = migration.version;
      }
      database.exec("COMMIT");
    }
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = NORMAL");
    if (backupPath) pruneBackups(backupDirectory, databasePath);
    return { database, backupPath, schemaVersion: readUserVersion(database) };
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The transaction may not have started; restoration below remains authoritative.
    }
    database.close();
    if (backupPath) {
      copyFileSync(backupPath, databasePath);
    } else if (!existed && existsSync(databasePath)) {
      rmSync(databasePath, { force: true });
    }
    throw new DatabaseRecoveryRequiredError("本机数据库迁移失败，已恢复到迁移前状态", backupPath);
  }
}

export class LocalDatabaseStore {
  private updateFrozen = false;
  constructor(private readonly database: DatabaseSync) {}

  isUpdateFrozen(): boolean { return this.updateFrozen; }

  /** Main-process only. VACUUM INTO includes committed WAL contents; raw file copy does not.
   * The caller must finish renderer saves and reject concurrent IPC before calling this.
   * No restore is automatic: a later application rollback must retain new user data. */
  prepareUpdateBackup(directory: string, rendererState: Record<string, string>): { path: string; release(): void } {
    if (this.updateFrozen) throw new Error('UPDATE_SAVE_UNAVAILABLE');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const destination = join(directory, `update-${randomUUID()}.sqlite`);
    let probe: DatabaseSync | undefined;
    try {
      this.database.prepare('VACUUM INTO ?').run(destination);
      probe = new DatabaseSync(destination, { readOnly: true });
      const row = probe.prepare('PRAGMA integrity_check').get() as { integrity_check?: string };
      if (row.integrity_check !== 'ok' || readUserVersion(probe) !== readUserVersion(this.database)) throw new Error('UPDATE_BACKUP_INVALID');
      probe.close(); probe = undefined;
      const bytes = readFileSync(destination);
      writeFileSync(`${destination}.json`, JSON.stringify({ schema: 1, databaseSha256: createHash('sha256').update(bytes).digest('hex'),
        databaseSize: bytes.length, rendererState }), { flag: 'wx', mode: 0o600 });
      // Sync backup + freeze are one main-thread critical section with no await gap.
      this.database.exec('PRAGMA query_only = ON');
      this.updateFrozen = true;
      let released = false;
      return { path: destination, release: () => {
        if (released) return;
        this.database.exec('PRAGMA query_only = OFF');
        this.updateFrozen = false; released = true;
      } };
    } catch (error) {
      probe?.close();
      // Retain partial evidence locally for recovery; do not overwrite or delete originals.
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  writeProviderMetadataCache(providerId: string, accountScopeHash: string, cacheKey: string, value: unknown, expiresAt: number): void {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO provider_metadata_cache(provider_id, account_scope_hash, cache_key, value_json, expires_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, account_scope_hash, cache_key) DO UPDATE SET
        value_json=excluded.value_json, expires_at=excluded.expires_at, accessed_at=excluded.accessed_at
    `).run(providerId, accountScopeHash, cacheKey, safeCacheJson(value), expiresAt, now);
  }

  readProviderMetadataCache<T>(providerId: string, accountScopeHash: string, cacheKey: string, now = Date.now()): MetadataCacheRecord<T> | undefined {
    const row = this.database.prepare(`
      SELECT value_json, expires_at FROM provider_metadata_cache
      WHERE provider_id = ? AND account_scope_hash = ? AND cache_key = ?
    `).get(providerId, accountScopeHash, cacheKey) as { value_json: string; expires_at: number } | undefined;
    if (!row) return undefined;
    this.database.prepare(`
      UPDATE provider_metadata_cache SET accessed_at = ?
      WHERE provider_id = ? AND account_scope_hash = ? AND cache_key = ?
    `).run(now, providerId, accountScopeHash, cacheKey);
    return { value: JSON.parse(row.value_json) as T, expiresAt: Number(row.expires_at), stale: Number(row.expires_at) <= now };
  }

  clearProviderMetadataCache(providerId: string, accountScopeHash?: string): void {
    if (accountScopeHash) this.database.prepare(
      "DELETE FROM provider_metadata_cache WHERE provider_id = ? AND account_scope_hash = ?"
    ).run(providerId, accountScopeHash);
    else this.database.prepare("DELETE FROM provider_metadata_cache WHERE provider_id = ?").run(providerId);
  }

  writeRadioCatalogCache(stationId: string, value: unknown, expiresAt: number): void {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO radio_catalog_cache(station_id, value_json, expires_at, accessed_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(station_id) DO UPDATE SET value_json=excluded.value_json, expires_at=excluded.expires_at, accessed_at=excluded.accessed_at
    `).run(stationId, safeCacheJson(value), expiresAt, now);
  }

  readRadioCatalogCache<T>(stationId: string, now = Date.now()): MetadataCacheRecord<T> | undefined {
    const row = this.database.prepare(
      "SELECT value_json, expires_at FROM radio_catalog_cache WHERE station_id = ?"
    ).get(stationId) as { value_json: string; expires_at: number } | undefined;
    if (!row) return undefined;
    this.database.prepare("UPDATE radio_catalog_cache SET accessed_at = ? WHERE station_id = ?").run(now, stationId);
    return { value: JSON.parse(row.value_json) as T, expiresAt: Number(row.expires_at), stale: Number(row.expires_at) <= now };
  }

  listTracks(): Track[] {
    const rows = this.database.prepare(
      `SELECT t.id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.source_json
       FROM library_tracks t
       WHERE t.media_token IS NULL OR EXISTS (
         SELECT 1 FROM file_locations f WHERE f.track_id = t.id AND f.missing = 0
       )
       ORDER BY t.artist, t.title LIMIT ?`
    ).all(MAX_TRACK_ROWS) as Array<Record<string, unknown>>;
    return rows.map(rowToTrack);
  }

  trackCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM library_tracks WHERE media_token IS NOT NULL").get() as { count: number };
    return Number(row.count);
  }

  readLocalProfileCounts(): LocalProfileCounts {
    const row = this.database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM library_tracks WHERE media_token IS NOT NULL) AS track_count,
        (SELECT COUNT(*) FROM queue_items) AS queue_item_count,
        (SELECT COUNT(*) FROM playlists) AS playlist_count,
        (SELECT COUNT(*) FROM focus_records) AS focus_record_count,
        (SELECT MAX(COALESCE(finished_at, started_at)) FROM focus_records) AS latest_focus_at,
        EXISTS(SELECT 1 FROM entertainment_state WHERE tool_id = 'preferences') AS has_entertainment_settings
    `).get() as Record<string, unknown>;
    return {
      trackCount: Number(row.track_count),
      queueItemCount: Number(row.queue_item_count),
      playlistCount: Number(row.playlist_count),
      focusRecordCount: Number(row.focus_record_count),
      latestFocusAt: row.latest_focus_at == null ? undefined : Number(row.latest_focus_at),
      hasEntertainmentSettings: Number(row.has_entertainment_settings) === 1
    };
  }

  importLocalFiles(files: ScannedAudioFile[]): { imported: number; updated: number } {
    let imported = 0;
    let updated = 0;
    for (const file of files.slice(0, MAX_TRACK_ROWS)) {
      const result = this.upsertScannedLocation(file);
      if (result.status === "imported") imported += 1;
      else updated += 1;
    }
    return { imported, updated };
  }

  reconcileLocalFiles(rootPath: string, files: ScannedAudioFile[], markMissing: boolean): { imported: number; updated: number; missing: number } {
    const root = this.ensureLibraryRoot(rootPath);
    let imported = 0;
    let updated = 0;
    for (const file of files.slice(0, MAX_TRACK_ROWS)) {
      const result = this.upsertScannedLocation(file, root.id);
      if (result.status === "imported") imported += 1;
      else updated += 1;
    }
    const missing = markMissing ? this.reconcileRoot(root.id, files.map((file) => file.path)) : 0;
    return { imported, updated, missing };
  }

  ensureLibraryRoot(rootPath: string): LibraryRootEntry {
    const localPath = resolve(rootPath);
    const existing = this.database.prepare(
      "SELECT id, display_name, local_path, watch_enabled, watch_state, last_scan_at FROM library_roots WHERE local_path = ?"
    ).get(localPath) as Record<string, unknown> | undefined;
    if (existing) return this.rowToRoot(existing);
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO library_roots(id, display_name, local_path, watch_enabled, watch_state)
      VALUES (?, ?, ?, 0, 'off')
    `).run(id, basename(localPath) || localPath, localPath);
    return { id, displayName: basename(localPath) || localPath, localPath, watchEnabled: false, watchState: "off" };
  }

  listLibraryRoots(): LibraryRootSummary[] {
    const rows = this.database.prepare(`
      SELECT id, display_name, local_path, watch_enabled, watch_state, last_scan_at
      FROM library_roots ORDER BY display_name COLLATE NOCASE
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const root = this.rowToRoot(row);
      const { localPath: _privatePath, ...summary } = root;
      return summary;
    });
  }

  listEnabledLibraryRootEntries(): LibraryRootEntry[] {
    return (this.database.prepare(`
      SELECT id, display_name, local_path, watch_enabled, watch_state, last_scan_at
      FROM library_roots WHERE watch_enabled = 1
    `).all() as Array<Record<string, unknown>>).map((row) => this.rowToRoot(row));
  }

  getLibraryRootEntry(rootId: string): LibraryRootEntry {
    const row = this.database.prepare(`
      SELECT id, display_name, local_path, watch_enabled, watch_state, last_scan_at
      FROM library_roots WHERE id = ?
    `).get(rootId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("LIBRARY_ROOT_NOT_FOUND");
    return this.rowToRoot(row);
  }

  setLibraryRootWatching(rootId: string, enabled: boolean, state: LibraryRootSummary["watchState"]): LibraryRootSummary {
    this.database.prepare(
      "UPDATE library_roots SET watch_enabled = ?, watch_state = ? WHERE id = ?"
    ).run(enabled ? 1 : 0, state, rootId);
    const root = this.getLibraryRootEntry(rootId);
    const { localPath: _privatePath, ...summary } = root;
    return summary;
  }

  setLibraryRootWatchState(rootId: string, state: LibraryRootSummary["watchState"]): void {
    this.database.prepare("UPDATE library_roots SET watch_state = ? WHERE id = ?").run(state, rootId);
  }

  findLocationByPath(path: string): LocationCandidate | undefined {
    const row = this.database.prepare(`
      SELECT f.id, f.track_id, f.local_path, f.content_hash, f.file_size, f.modified_at, t.created_at
      FROM file_locations f JOIN library_tracks t ON t.id = f.track_id WHERE f.local_path = ?
    `).get(resolve(path)) as Record<string, unknown> | undefined;
    return row ? this.rowToCandidate(row) : undefined;
  }

  findFingerprintCandidates(quickSignature: string, size: number, exceptPath?: string): LocationCandidate[] {
    const rows = this.database.prepare(`
      SELECT f.id, f.track_id, f.local_path, f.content_hash, f.file_size, f.modified_at, t.created_at
      FROM file_locations f JOIN library_tracks t ON t.id = f.track_id
      WHERE f.quick_signature = ? AND f.file_size = ? AND f.local_path <> ?
      ORDER BY t.created_at, f.last_seen_at DESC
    `).all(quickSignature, size, resolve(exceptPath || "")) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToCandidate(row));
  }

  setLocationContentHash(locationId: string, contentHash: string): void {
    this.database.prepare("UPDATE file_locations SET content_hash = ? WHERE id = ?").run(contentHash, locationId);
  }

  upsertScannedLocation(file: ScannedAudioFile, rootId?: string, targetTrackId?: string, contentHash?: string): LocationUpsertResult {
    const path = resolve(file.path);
    const existing = this.findLocationByPath(path);
    const now = Date.now();
    const artworkUrl = file.artwork ? `studyroom-media://artwork/${file.artwork.token}` : null;
    const mediaToken = targetTrackId
      ? (this.database.prepare("SELECT media_token FROM library_tracks WHERE id = ?").get(targetTrackId) as { media_token?: string } | undefined)?.media_token
      : undefined;
    const chosenTrackId = targetTrackId || existing?.trackId || `local:${randomUUID()}`;
    const chosenMediaToken = mediaToken || (existing
      ? (this.database.prepare("SELECT media_token FROM library_tracks WHERE id = ?").get(existing.trackId) as { media_token?: string } | undefined)?.media_token
      : undefined) || randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!existing && !targetTrackId) {
        this.database.prepare(`
          INSERT INTO library_tracks(id, title, artist, album, duration_ms, artwork_url, source_json, created_at, updated_at, media_token)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(chosenTrackId, file.title, file.artist, file.album ?? null, file.durationMs ?? null, artworkUrl,
          JSON.stringify({ kind: "local", fileToken: chosenMediaToken }), now, now, chosenMediaToken);
      } else {
        this.database.prepare(`
          UPDATE library_tracks SET title=?, artist=?, album=?, duration_ms=?, artwork_url=?, updated_at=? WHERE id=?
        `).run(file.title, file.artist, file.album ?? null, file.durationMs ?? null, artworkUrl, now, chosenTrackId);
      }
      if (existing) {
        this.database.prepare(`
          UPDATE file_locations SET track_id=?, root_id=COALESCE(?, root_id), quick_signature=?, content_hash=?,
            last_seen_at=?, missing=0, file_size=?, modified_at=?, artwork_token=?, artwork_path=?, artwork_mime=?, lyrics_text=?, lyrics_source=?
          WHERE id=?
        `).run(chosenTrackId, rootId ?? null, file.quickSignature, contentHash ?? null, now, file.size, file.modifiedAt,
          file.artwork?.token ?? null, file.artwork?.path ?? null, file.artwork?.mimeType ?? null,
          file.lyrics ?? null, file.lyricsSource ?? null, existing.id);
      } else {
        this.database.prepare(`
          INSERT INTO file_locations(
            id, track_id, local_path, root_id, quick_signature, content_hash, last_seen_at, missing,
            file_size, modified_at, artwork_token, artwork_path, artwork_mime, lyrics_text, lyrics_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), chosenTrackId, path, rootId ?? null, file.quickSignature, contentHash ?? null, now,
          file.size, file.modifiedAt, file.artwork?.token ?? null, file.artwork?.path ?? null,
          file.artwork?.mimeType ?? null, file.lyrics ?? null, file.lyricsSource ?? null);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { status: existing ? "updated" : targetTrackId ? "added-location" : "imported", trackId: chosenTrackId };
  }

  reconcileRoot(rootId: string, seenPaths: string[]): number {
    const seen = new Set(seenPaths.map((path) => resolve(path)));
    const locations = this.database.prepare("SELECT id, local_path FROM file_locations WHERE root_id = ?").all(rootId) as Array<{ id: string; local_path: string }>;
    const mark = this.database.prepare("UPDATE file_locations SET missing = ? WHERE id = ?");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const location of locations) mark.run(seen.has(location.local_path) ? 0 : 1, location.id);
      this.database.prepare("UPDATE library_roots SET last_scan_at = ? WHERE id = ?").run(Date.now(), rootId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return Number((this.database.prepare("SELECT COUNT(*) AS count FROM file_locations WHERE root_id = ? AND missing = 1").get(rootId) as { count: number }).count);
  }

  markLocationMissing(path: string): void {
    this.database.prepare("UPDATE file_locations SET missing = 1 WHERE local_path = ?").run(resolve(path));
  }

  listMissingTracks(): MissingTrack[] {
    const rows = this.database.prepare(`
      SELECT t.id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.source_json, f.last_seen_at
      FROM library_tracks t JOIN file_locations f ON f.track_id = t.id
      WHERE f.last_seen_at = (SELECT MAX(last_seen_at) FROM file_locations WHERE track_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM file_locations available WHERE available.track_id = t.id AND available.missing = 0)
      ORDER BY f.last_seen_at DESC LIMIT ?
    `).all(MAX_TRACK_ROWS) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ track: rowToTrack(row), lastSeenAt: Number(row.last_seen_at) }));
  }

  relocateLocalFile(trackId: string, file: ScannedAudioFile): Track {
    const missing = this.database.prepare(`
      SELECT 1 FROM library_tracks t WHERE t.id = ?
        AND NOT EXISTS (SELECT 1 FROM file_locations f WHERE f.track_id = t.id AND f.missing = 0)
    `).get(trackId);
    if (!missing) throw new Error("TRACK_NOT_MISSING");
    this.upsertScannedLocation(file, undefined, trackId);
    const track = this.database.prepare(
      "SELECT id, title, artist, album, duration_ms, artwork_url, source_json FROM library_tracks WHERE id = ?"
    ).get(trackId) as Record<string, unknown> | undefined;
    if (!track) throw new Error("TRACK_NOT_FOUND");
    return rowToTrack(track);
  }

  getTrackLyrics(trackId: string): TrackLyrics | undefined {
    const row = this.database.prepare(
      `SELECT lyrics_text, lyrics_source FROM file_locations
       WHERE track_id = ? AND lyrics_text IS NOT NULL ORDER BY missing, last_seen_at DESC LIMIT 1`
    ).get(trackId) as { lyrics_text?: string; lyrics_source?: "embedded" | "sidecar" } | undefined;
    return row?.lyrics_text && row.lyrics_source
      ? { trackId, content: row.lyrics_text, source: row.lyrics_source }
      : undefined;
  }

  resolveLocalFile(fileToken: string): string | undefined {
    const row = this.database.prepare(
      `SELECT f.local_path FROM library_tracks t JOIN file_locations f ON f.track_id = t.id
       WHERE t.media_token = ? AND f.missing = 0 ORDER BY f.last_seen_at DESC LIMIT 1`
    ).get(fileToken) as { local_path?: string } | undefined;
    return row?.local_path || undefined;
  }

  resolveArtworkFile(artworkToken: string): { path: string; mimeType: string } | undefined {
    const row = this.database.prepare(
      "SELECT artwork_path, artwork_mime FROM file_locations WHERE artwork_token = ?"
    ).get(artworkToken) as { artwork_path?: string; artwork_mime?: string } | undefined;
    return row?.artwork_path && row.artwork_mime ? { path: row.artwork_path, mimeType: row.artwork_mime } : undefined;
  }

  mergeTracks(canonicalTrackId: string, duplicateTrackId: string): void {
    if (canonicalTrackId === duplicateTrackId) return;
    const canonical = this.database.prepare("SELECT media_token FROM library_tracks WHERE id = ?").get(canonicalTrackId) as { media_token?: string } | undefined;
    if (!canonical?.media_token) throw new Error("TRACK_NOT_FOUND");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position)
        SELECT playlist_id, ?, position FROM playlist_tracks WHERE track_id = ?
      `).run(canonicalTrackId, duplicateTrackId);
      this.database.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").run(duplicateTrackId);
      this.database.prepare(`
        INSERT OR IGNORE INTO favorite_tracks(track_id, created_at)
        SELECT ?, created_at FROM favorite_tracks WHERE track_id = ?
      `).run(canonicalTrackId, duplicateTrackId);
      this.database.prepare("DELETE FROM favorite_tracks WHERE track_id = ?").run(duplicateTrackId);
      this.database.prepare("UPDATE playback_history SET track_id = ? WHERE track_id = ?").run(canonicalTrackId, duplicateTrackId);
      const queueRows = this.database.prepare("SELECT position, track_json FROM queue_items").all() as Array<{ position: number; track_json: string }>;
      const updateQueue = this.database.prepare("UPDATE queue_items SET track_json = ? WHERE position = ?");
      for (const row of queueRows) {
        const track = JSON.parse(row.track_json) as Track;
        if (track.id !== duplicateTrackId) continue;
        track.id = canonicalTrackId;
        track.source = { kind: "local", fileToken: canonical.media_token };
        updateQueue.run(JSON.stringify(track), row.position);
      }
      this.database.prepare("UPDATE file_locations SET track_id = ? WHERE track_id = ?").run(canonicalTrackId, duplicateTrackId);
      this.database.prepare("DELETE FROM library_tracks WHERE id = ?").run(duplicateTrackId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  recordPlaybackEvent(event: PlaybackHistoryEvent): void {
    if (event.state === "started") {
      this.database.prepare(`
        INSERT OR IGNORE INTO playback_history(track_id, played_at, completed, session_id) VALUES (?, ?, 0, ?)
      `).run(event.trackId, event.playedAt, event.sessionId);
    } else {
      this.database.prepare("UPDATE playback_history SET completed = 1 WHERE session_id = ? AND track_id = ?").run(event.sessionId, event.trackId);
    }
    this.database.prepare(`
      DELETE FROM playback_history WHERE id NOT IN (
        SELECT id FROM playback_history ORDER BY played_at DESC, id DESC LIMIT ?
      )
    `).run(MAX_HISTORY_ROWS);
  }

  listRecentTracks(): Track[] {
    const rows = this.database.prepare(`
      SELECT id, title, artist, album, duration_ms, artwork_url, source_json FROM (
        SELECT t.id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.source_json,
          ROW_NUMBER() OVER (PARTITION BY h.track_id ORDER BY h.played_at DESC, h.id DESC) AS rank,
          MAX(h.played_at) OVER (PARTITION BY h.track_id) AS latest
        FROM playback_history h JOIN library_tracks t ON t.id = h.track_id
        WHERE t.media_token IS NULL OR EXISTS (
          SELECT 1 FROM file_locations available WHERE available.track_id = t.id AND available.missing = 0
        )
      ) WHERE rank = 1 ORDER BY latest DESC LIMIT 100
    `).all() as Array<Record<string, unknown>>;
    return rows.map(rowToTrack);
  }

  listFavoriteTracks(): Track[] {
    const rows = this.database.prepare(`
      SELECT t.id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.source_json
      FROM favorite_tracks f JOIN library_tracks t ON t.id = f.track_id
      ORDER BY f.created_at DESC, t.id
      LIMIT ?
    `).all(MAX_TRACK_ROWS) as Array<Record<string, unknown>>;
    return rows.map(rowToTrack);
  }

  setTrackFavorite(trackId: string, favorite: boolean): boolean {
    if (!favorite) {
      this.database.prepare("DELETE FROM favorite_tracks WHERE track_id = ?").run(trackId);
      return false;
    }
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO favorite_tracks(track_id, created_at)
      SELECT id, ? FROM library_tracks WHERE id = ?
    `).run(Date.now(), trackId);
    const exists = this.database.prepare("SELECT 1 FROM library_tracks WHERE id = ?").get(trackId);
    if (!exists) throw new Error("TRACK_NOT_FOUND");
    return result.changes > 0 || Boolean(this.database.prepare("SELECT 1 FROM favorite_tracks WHERE track_id = ?").get(trackId));
  }

  listPlaylists(): LocalPlaylistSummary[] {
    const rows = this.database.prepare(`
      SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.track_id) AS track_count
      FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.name COLLATE NOCASE, p.id
      LIMIT ?
    `).all(MAX_PLAYLISTS) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToPlaylistSummary(row));
  }

  createPlaylist(name: string): LocalPlaylistSummary {
    const count = Number((this.database.prepare("SELECT COUNT(*) AS count FROM playlists").get() as { count: number }).count);
    if (count >= MAX_PLAYLISTS) throw new Error("PLAYLIST_LIMIT_EXCEEDED");
    const id = randomUUID();
    const now = Date.now();
    this.database.prepare("INSERT INTO playlists(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, name, now, now);
    return { id, name, trackCount: 0, createdAt: now, updatedAt: now };
  }

  renamePlaylist(playlistId: string, name: string): LocalPlaylistSummary {
    const result = this.database.prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, Date.now(), playlistId);
    if (result.changes === 0) throw new Error("PLAYLIST_NOT_FOUND");
    return this.getPlaylist(playlistId);
  }

  deletePlaylist(playlistId: string): void {
    const result = this.database.prepare("DELETE FROM playlists WHERE id = ?").run(playlistId);
    if (result.changes === 0) throw new Error("PLAYLIST_NOT_FOUND");
  }

  listPlaylistItems(playlistId: string): LocalPlaylistItem[] {
    if (!this.database.prepare("SELECT 1 FROM playlists WHERE id = ?").get(playlistId)) {
      throw new Error("PLAYLIST_NOT_FOUND");
    }
    const rows = this.database.prepare(`
      SELECT pt.playlist_id, pt.position, t.id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.source_json
      FROM playlist_tracks pt JOIN library_tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position, pt.track_id
      LIMIT ?
    `).all(playlistId, MAX_PLAYLIST_TRACKS) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      playlistId: String(row.playlist_id),
      track: rowToTrack(row),
      position: Number(row.position)
    }));
  }

  addPlaylistTrack(playlistId: string, trackId: string): LocalPlaylistItem[] {
    if (!this.database.prepare("SELECT 1 FROM playlists WHERE id = ?").get(playlistId)) {
      throw new Error("PLAYLIST_NOT_FOUND");
    }
    if (!this.database.prepare("SELECT 1 FROM library_tracks WHERE id = ?").get(trackId)) {
      throw new Error("TRACK_NOT_FOUND");
    }
    const count = Number((this.database.prepare(
      "SELECT COUNT(*) AS count FROM playlist_tracks WHERE playlist_id = ?"
    ).get(playlistId) as { count: number }).count);
    const duplicate = this.database.prepare(
      "SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?"
    ).get(playlistId, trackId);
    if (!duplicate && count >= MAX_PLAYLIST_TRACKS) throw new Error("PLAYLIST_TRACK_LIMIT_EXCEEDED");
    const now = Date.now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT OR IGNORE INTO playlist_tracks(playlist_id, track_id, position) VALUES (?, ?, ?)
      `).run(playlistId, trackId, count);
      this.database.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now, playlistId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.listPlaylistItems(playlistId);
  }

  removePlaylistTrack(playlistId: string, trackId: string): LocalPlaylistItem[] {
    if (!this.database.prepare("SELECT 1 FROM playlists WHERE id = ?").get(playlistId)) {
      throw new Error("PLAYLIST_NOT_FOUND");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?")
        .run(playlistId, trackId);
      const rows = this.database.prepare(
        "SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, track_id"
      ).all(playlistId) as Array<{ track_id: string }>;
      const update = this.database.prepare(
        "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?"
      );
      rows.forEach((row, position) => update.run(position, playlistId, row.track_id));
      this.database.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(Date.now(), playlistId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.listPlaylistItems(playlistId);
  }

  getTrackLyricOffset(trackId: string): number {
    const row = this.database.prepare("SELECT offset_ms FROM track_lyric_offsets WHERE track_id = ?")
      .get(trackId) as { offset_ms?: number } | undefined;
    return Number(row?.offset_ms ?? 0);
  }

  saveTrackLyricOffset(trackId: string, offsetMs: number): number {
    if (!this.database.prepare("SELECT 1 FROM library_tracks WHERE id = ?").get(trackId)) {
      throw new Error("TRACK_NOT_FOUND");
    }
    if (offsetMs === 0) {
      this.database.prepare("DELETE FROM track_lyric_offsets WHERE track_id = ?").run(trackId);
      return 0;
    }
    this.database.prepare(`
      INSERT INTO track_lyric_offsets(track_id, offset_ms, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET offset_ms=excluded.offset_ms, updated_at=excluded.updated_at
    `).run(trackId, offsetMs, Date.now());
    return offsetMs;
  }

  readSoundSettings(): SoundSettings | undefined {
    try {
      return this.getSetting<SoundSettings>(SOUND_SETTINGS_KEY);
    } catch {
      return undefined;
    }
  }

  saveSoundSettings(settings: SoundSettings): void {
    this.setSetting(SOUND_SETTINGS_KEY, settings);
  }

  listSoundSnapshots(): SoundSnapshot[] {
    const rows = this.database.prepare(`
      SELECT id, name, mixer_json, updated_at FROM sound_snapshots
      ORDER BY updated_at DESC, id LIMIT ?
    `).all(MAX_SOUND_SNAPSHOTS) as Array<Record<string, unknown>>;
    const snapshots: SoundSnapshot[] = [];
    for (const row of rows) {
      try {
        snapshots.push({
          id: String(row.id),
          name: String(row.name),
          state: JSON.parse(String(row.mixer_json)) as SoundSnapshot["state"],
          updatedAt: Number(row.updated_at)
        });
      } catch {
        // A damaged snapshot does not make the remaining sound center state unreadable.
      }
    }
    return snapshots;
  }

  saveSoundSnapshot(snapshot: Omit<SoundSnapshot, "updatedAt">): SoundSnapshot {
    const exists = this.database.prepare("SELECT 1 FROM sound_snapshots WHERE id = ?").get(snapshot.id);
    const count = Number((this.database.prepare("SELECT COUNT(*) AS count FROM sound_snapshots").get() as { count: number }).count);
    if (!exists && count >= MAX_SOUND_SNAPSHOTS) throw new Error("SOUND_SNAPSHOT_LIMIT_EXCEEDED");
    const updatedAt = Date.now();
    this.database.prepare(`
      INSERT INTO sound_snapshots(id, name, mixer_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, mixer_json=excluded.mixer_json, updated_at=excluded.updated_at
    `).run(snapshot.id, snapshot.name, JSON.stringify(snapshot.state), updatedAt);
    return { ...snapshot, updatedAt };
  }

  renameSoundSnapshot(snapshotId: string, name: string): SoundSnapshot {
    const result = this.database.prepare("UPDATE sound_snapshots SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, Date.now(), snapshotId);
    if (result.changes === 0) throw new Error("SOUND_SNAPSHOT_NOT_FOUND");
    const snapshot = this.listSoundSnapshots().find((entry) => entry.id === snapshotId);
    if (!snapshot) throw new Error("SOUND_SNAPSHOT_NOT_FOUND");
    return snapshot;
  }

  deleteSoundSnapshot(snapshotId: string): void {
    const result = this.database.prepare("DELETE FROM sound_snapshots WHERE id = ?").run(snapshotId);
    if (result.changes === 0) throw new Error("SOUND_SNAPSHOT_NOT_FOUND");
  }

  private rowToRoot(row: Record<string, unknown>): LibraryRootEntry {
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      localPath: String(row.local_path),
      watchEnabled: Number(row.watch_enabled) === 1,
      watchState: String(row.watch_state) as LibraryRootSummary["watchState"],
      lastScanAt: row.last_scan_at == null ? undefined : Number(row.last_scan_at)
    };
  }

  private rowToPlaylistSummary(row: Record<string, unknown>): LocalPlaylistSummary {
    return {
      id: String(row.id),
      name: String(row.name),
      trackCount: Number(row.track_count),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  private getPlaylist(playlistId: string): LocalPlaylistSummary {
    const row = this.database.prepare(`
      SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pt.track_id) AS track_count
      FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      WHERE p.id = ? GROUP BY p.id
    `).get(playlistId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("PLAYLIST_NOT_FOUND");
    return this.rowToPlaylistSummary(row);
  }

  private rowToCandidate(row: Record<string, unknown>): LocationCandidate {
    return {
      id: String(row.id),
      trackId: String(row.track_id),
      path: String(row.local_path),
      contentHash: row.content_hash == null ? undefined : String(row.content_hash),
      createdAt: Number(row.created_at),
      size: row.file_size == null ? undefined : Number(row.file_size),
      modifiedAt: row.modified_at == null ? undefined : Number(row.modified_at)
    };
  }

  replaceQueue(items: QueueItem[]): void {
    if (items.length > MAX_QUEUE_ITEMS) throw new Error("QUEUE_LIMIT_EXCEEDED");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec("DELETE FROM queue_items");
      const insert = this.database.prepare(
        "INSERT INTO queue_items(position, queue_item_id, track_json, queued_at) VALUES (?, ?, ?, ?)"
      );
      items.forEach((item, position) => {
        insert.run(position, item.id, JSON.stringify(item.track), item.queuedAt);
      });
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  readQueue(): QueueItem[] {
    const rows = this.database.prepare(
      "SELECT queue_item_id, track_json, queued_at FROM queue_items ORDER BY position LIMIT ?"
    ).all(MAX_QUEUE_ITEMS) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.queue_item_id),
      track: JSON.parse(String(row.track_json)) as Track,
      queuedAt: Number(row.queued_at)
    }));
  }

  saveFocusRecord(record: FocusRecordDraft): void {
    this.database.prepare(`
      INSERT INTO focus_records(
        client_record_id, started_at, finished_at, planned_minutes, completed_minutes,
        completed_seconds, scene_code, time_key, status, sync_status, sync_policy,
        account_scope, cloud_record_id, sync_error, updated_at, activity_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_record_id) DO UPDATE SET
        finished_at=excluded.finished_at,
        planned_minutes=excluded.planned_minutes,
        completed_minutes=excluded.completed_minutes,
        completed_seconds=excluded.completed_seconds,
        scene_code=excluded.scene_code,
        time_key=excluded.time_key,
        status=excluded.status,
        sync_status=excluded.sync_status,
        sync_policy=excluded.sync_policy,
        account_scope=excluded.account_scope,
        cloud_record_id=excluded.cloud_record_id,
        sync_error=excluded.sync_error,
        updated_at=excluded.updated_at,
        activity_session_id=excluded.activity_session_id
    `).run(
      record.clientRecordId,
      record.startedAt,
      record.finishedAt ?? null,
      record.plannedMinutes,
      record.completedMinutes,
      record.completedSeconds ?? record.completedMinutes * 60,
      record.sceneCode ?? "mountain",
      record.timeKey ?? "morning",
      record.status,
      record.syncStatus,
      record.syncPolicy ?? "manual-only",
      record.accountScope ?? null,
      record.cloudRecordId ?? null,
      record.syncError?.slice(0, 300) ?? null,
      Date.now(), record.activitySessionId ?? null
    );
  }

  private mapFocusRecord(row: Record<string, unknown>): FocusRecordDraft {
    return {
      clientRecordId: String(row.client_record_id),
      activitySessionId: row.activity_session_id == null ? undefined : String(row.activity_session_id),
      startedAt: Number(row.started_at),
      finishedAt: row.finished_at == null ? undefined : Number(row.finished_at),
      plannedMinutes: Number(row.planned_minutes),
      completedMinutes: Number(row.completed_minutes),
      completedSeconds: Number(row.completed_seconds ?? Number(row.completed_minutes) * 60),
      sceneCode: String(row.scene_code ?? "mountain"),
      timeKey: String(row.time_key ?? "morning"),
      status: String(row.status) as FocusRecordDraft["status"],
      syncStatus: String(row.sync_status) as FocusRecordDraft["syncStatus"],
      syncPolicy: String(row.sync_policy ?? "manual-only") as FocusRecordDraft["syncPolicy"],
      accountScope: row.account_scope == null ? undefined : String(row.account_scope),
      cloudRecordId: row.cloud_record_id == null ? undefined : String(row.cloud_record_id),
      syncError: row.sync_error == null ? undefined : String(row.sync_error)
    };
  }

  listFocusRecords(request: FocusRecordListRequest = {}): FocusRecordDraft[] {
    const limit = Math.max(1, Math.min(MAX_FOCUS_RECORDS, request.limit ?? 500));
    const rows = request.syncPolicy
      ? this.database.prepare(`
          SELECT client_record_id, started_at, finished_at, planned_minutes, completed_minutes,
          completed_seconds, scene_code, time_key, status, sync_status, sync_policy, account_scope,
          activity_session_id, sync_error, CAST(cloud_record_id AS TEXT) AS cloud_record_id FROM focus_records WHERE sync_policy = ? ORDER BY started_at DESC LIMIT ?
        `).all(request.syncPolicy, limit)
      : this.database.prepare(`SELECT client_record_id, started_at, finished_at, planned_minutes, completed_minutes,
          completed_seconds, scene_code, time_key, status, sync_status, sync_policy, account_scope,
          activity_session_id, sync_error, CAST(cloud_record_id AS TEXT) AS cloud_record_id FROM focus_records ORDER BY started_at DESC LIMIT ?`).all(limit);
    return (rows as Array<Record<string, unknown>>).map((row) => this.mapFocusRecord(row));
  }

  listPendingFocusRecords(): FocusRecordDraft[] {
    const rows = this.database.prepare(`
      SELECT client_record_id, started_at, finished_at, planned_minutes, completed_minutes,
          completed_seconds, scene_code, time_key, status, sync_status, sync_policy, account_scope,
          activity_session_id, sync_error, CAST(cloud_record_id AS TEXT) AS cloud_record_id
      FROM focus_records
      WHERE sync_policy = 'automatic' AND sync_status IN ('pending', 'failed')
      ORDER BY started_at
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapFocusRecord(row));
  }

  readFocusWorkspace(accountScope: string): FocusWorkspace | undefined {
    const row = this.database.prepare(
      "SELECT workspace_json FROM focus_workspaces WHERE account_scope = ?"
    ).get(accountScope) as { workspace_json?: string } | undefined;
    return row?.workspace_json ? JSON.parse(row.workspace_json) as FocusWorkspace : undefined;
  }

  saveFocusWorkspace(workspace: FocusWorkspace): void {
    const json = JSON.stringify(workspace);
    if (Buffer.byteLength(json, "utf8") > MAX_FOCUS_WORKSPACE_BYTES) throw new Error("FOCUS_WORKSPACE_TOO_LARGE");
    this.database.prepare(`
      INSERT INTO focus_workspaces(account_scope, workspace_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(account_scope) DO UPDATE SET workspace_json=excluded.workspace_json, updated_at=excluded.updated_at
    `).run(workspace.accountScope, json, workspace.updatedAt);
  }

  readEntertainmentState(toolId: EntertainmentStateId): EntertainmentStateRecord | undefined {
    const row = this.database.prepare(`
      SELECT state_json, updated_at FROM entertainment_state WHERE tool_id = ?
    `).get(toolId) as { state_json: string; updated_at: number } | undefined;
    if (!row) return undefined;
    try {
      return {
        toolId,
        state: JSON.parse(row.state_json) as EntertainmentState,
        updatedAt: Number(row.updated_at)
      };
    } catch {
      if((CLASSIC_GAME_IDS as readonly string[]).includes(toolId))throw new Error('ENTERTAINMENT_STATE_INVALID_PRESERVED');
      return undefined;
    }
  }

  saveEntertainmentState(toolId: EntertainmentStateId, state: EntertainmentState, expected?:{generation:string;revision:number}|null): void {
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json, "utf8") > MAX_ENTERTAINMENT_STATE_BYTES) {
      throw new Error("ENTERTAINMENT_STATE_TOO_LARGE");
    }
    if((CLASSIC_GAME_IDS as readonly string[]).includes(toolId)){
      if(!isClassicGame(state) || state.toolId!==toolId || expected===undefined)throw new Error('GAME_INVALID');
      const row=this.database.prepare('SELECT state_json FROM entertainment_state WHERE tool_id=?').get(toolId) as {state_json:string}|undefined;
      if(!row){
        if(expected!==null || state.revision!==0)throw new Error('GAME_REVISION_CONFLICT');
        const inserted=this.database.prepare('INSERT INTO entertainment_state(tool_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(tool_id) DO NOTHING').run(toolId,json,Date.now());
        if(Number(inserted.changes)!==1)throw new Error('GAME_REVISION_CONFLICT');return;
      }
      let before:unknown;try{before=JSON.parse(row.state_json);}catch{throw new Error('ENTERTAINMENT_STATE_INVALID_PRESERVED');}
      if(!isClassicGame(before))throw new Error('ENTERTAINMENT_STATE_INVALID_PRESERVED');
      if(!expected || before.generation!==expected.generation || before.revision!==expected.revision || state.generation===before.generation && state.revision<=before.revision || state.generation!==before.generation && state.revision!==0)throw new Error('GAME_REVISION_CONFLICT');
      const updated=this.database.prepare('UPDATE entertainment_state SET state_json=?,updated_at=? WHERE tool_id=? AND state_json=?').run(json,Date.now(),toolId,row.state_json);
      if(Number(updated.changes)!==1)throw new Error('GAME_REVISION_CONFLICT');return;
    }
    this.database.prepare(`
      INSERT INTO entertainment_state(tool_id, state_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(tool_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at
    `).run(toolId, json, Date.now());
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.database.prepare(
      "SELECT value_json FROM device_settings WHERE setting_key = ?"
    ).get(key) as { value_json?: string } | undefined;
    return row?.value_json ? JSON.parse(row.value_json) as T : undefined;
  }

  setSetting(key: string, value: unknown): void {
    this.database.prepare(`
      INSERT INTO device_settings(setting_key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).run(key, JSON.stringify(value), Date.now());
  }
}
