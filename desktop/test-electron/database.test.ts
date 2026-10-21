import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeLocalDatabase, LocalDatabaseStore } from "../src/database/database";
import { LocalLibraryImporter } from "../src/audio/library/importer";
import { DATABASE_MIGRATIONS, type DatabaseMigration } from "../src/database/migrations";
import type { QueueItem, SoundSettings } from "@studyroom/contracts";
import {newPuzzle,swapPuzzle,new2048,move2048,newMines,revealMine,newSpider,dealSpider,undoSpider,isClassicGame} from '@studyroom/contracts';

test('update backup includes committed WAL, freezes writes and releases on cancelled installation', () => {
  withTemporaryDirectory(directory => {
    const initialized = initializeLocalDatabase(join(directory, 'studyroom.sqlite'));
    initialized.database.exec('PRAGMA journal_mode = WAL');
    const store = new LocalDatabaseStore(initialized.database);
    store.setSetting('update-test-setting', { volume: 0.3, queue: ['synthetic-track'] });
    const backup = store.prepareUpdateBackup(join(directory, 'update-backups'), { 'studyroom-focus-session-v2': '{"synthetic":true}' });
    try {
      assert.equal(store.isUpdateFrozen(), true);
      assert.throws(() => store.setSetting('should-not-write', true));
      const copy = new LocalDatabaseStore(new DatabaseSync(backup.path, { readOnly: true }));
      try { assert.deepEqual(copy.getSetting('update-test-setting'), { volume: 0.3, queue: ['synthetic-track'] }); }
      finally { copy.close(); }
      const metadata = JSON.parse(readFileSync(`${backup.path}.json`, 'utf8'));
      assert.match(metadata.databaseSha256, /^[a-f0-9]{64}$/);
      assert.equal(metadata.rendererState['studyroom-focus-session-v2'], '{"synthetic":true}');
      backup.release(); backup.release();
      assert.equal(store.isUpdateFrozen(), false);
      store.setSetting('new-data-after-cancel', true);
      assert.equal(store.getSetting('new-data-after-cancel'), true);
    } finally { backup.release(); store.close(); }
  });
});

test('focus cloud IDs retain all decimal digits through SQLite and restart',()=>{
  withTemporaryDirectory(directory=>{
    const path=join(directory,'focus.sqlite');
    let initialized=initializeLocalDatabase(path),store=new LocalDatabaseStore(initialized.database);
    const ids=['2104509220480131074','2104509220480131075','9223372036854775807'];
    try {
      ids.forEach((cloudRecordId,index)=>store.saveFocusRecord({clientRecordId:`exact-${index}`,startedAt:100+index,plannedMinutes:25,completedMinutes:25,status:'completed',syncStatus:'pending',syncPolicy:'automatic',cloudRecordId}));
      store.close();initialized=initializeLocalDatabase(path);store=new LocalDatabaseStore(initialized.database);
      assert.deepEqual(store.listFocusRecords().map(record=>record.cloudRecordId),[...ids].reverse());
      assert.deepEqual(store.listPendingFocusRecords().map(record=>record.cloudRecordId),ids);
    } finally { store.close(); }
  });
});

test('all classic games reopen exactly after SQLite close and preserve incompatible saves',()=>{
  withTemporaryDirectory(directory=>{
    const path=join(directory,'studyroom.sqlite');
    let initialized=initializeLocalDatabase(path),store=new LocalDatabaseStore(initialized.database);
    const generation='11111111-1111-4111-8111-111111111111';
    const initial=[newPuzzle(4,generation,()=>.4),new2048(generation,()=>.4),newMines(2,generation),newSpider(4,generation,()=>.4)];
    const changed=[swapPuzzle(initial[0] as ReturnType<typeof newPuzzle>,0,1),move2048(initial[1] as ReturnType<typeof new2048>,'left',()=>.4),revealMine(initial[2] as ReturnType<typeof newMines>,0,()=>.4),dealSpider(initial[3] as ReturnType<typeof newSpider>)];
    for(let i=0;i<initial.length;i++){
      const a=initial[i]!,b=changed[i]!;store.saveEntertainmentState(a.toolId,a,null);
      assert.ok(isClassicGame(b));assert.ok(b.revision>0);
      store.saveEntertainmentState(b.toolId,b,{generation,revision:0});
    }
    store.close();initialized=initializeLocalDatabase(path);store=new LocalDatabaseStore(initialized.database);
    for(const game of changed){
      assert.deepEqual(store.readEntertainmentState(game.toolId)!.state,game);
      const text=JSON.stringify({...game,version:999});
      initialized.database.prepare('UPDATE entertainment_state SET state_json=? WHERE tool_id=?').run(text,game.toolId);
      assert.throws(()=>store.saveEntertainmentState(game.toolId,game,{generation,revision:game.revision}),/INVALID_PRESERVED/);
      assert.equal((initialized.database.prepare('SELECT state_json FROM entertainment_state WHERE tool_id=?').get(game.toolId) as {state_json:string}).state_json,text);
    }
    // A saved deal remains one reversible action after reload.
    const spider=changed[3] as ReturnType<typeof newSpider>;
    assert.deepEqual(undoSpider(spider).columns,(initial[3] as ReturnType<typeof newSpider>).columns);
    store.close();
  });
});

test('classic saves use generation/revision CAS and preserve bad or future data',()=>{
  withTemporaryDirectory(directory=>{
    const initialized=initializeLocalDatabase(join(directory,'studyroom.sqlite'));const store=new LocalDatabaseStore(initialized.database);
    const a=newPuzzle(3,'11111111-1111-4111-8111-111111111111',()=>.5);store.saveEntertainmentState('puzzle',a,null);
    const b=swapPuzzle(a,0,1);store.saveEntertainmentState('puzzle',b,{generation:a.generation,revision:0});
    assert.throws(()=>store.saveEntertainmentState('puzzle',a,{generation:a.generation,revision:0}),/CONFLICT/);
    const next=newPuzzle(4,'22222222-2222-4222-8222-222222222222',()=>.5);store.saveEntertainmentState('puzzle',next,{generation:b.generation,revision:b.revision});
    assert.throws(()=>store.saveEntertainmentState('puzzle',swapPuzzle(b,1,2),{generation:b.generation,revision:b.revision}),/CONFLICT/);
    assert.equal((store.readEntertainmentState('puzzle')!.state as any).generation,next.generation);
    for(const text of ['{broken','{"version":99,"toolId":"puzzle"}']){
      initialized.database.prepare('UPDATE entertainment_state SET state_json=? WHERE tool_id=?').run(text,'puzzle');
      assert.throws(()=>store.saveEntertainmentState('puzzle',a,null),/INVALID_PRESERVED/);
      assert.equal((initialized.database.prepare('SELECT state_json FROM entertainment_state WHERE tool_id=?').get('puzzle') as any).state_json,text);
    }
    store.close();
  });
});

function withTemporaryDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "studyroom-db-test-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test("initializes the complete local schema", () => {
  withTemporaryDirectory((directory) => {
    const databasePath = join(directory, "studyroom.sqlite");
    const initialized = initializeLocalDatabase(databasePath);
    const tables = initialized.database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>;

    assert.equal(initialized.schemaVersion, 9);
    assert.ok((initialized.database.prepare("PRAGMA table_info(focus_records)").all() as Array<{ name: string }>).some(column => column.name === "activity_session_id"));
    assert.ok(tables.some((row) => row.name === "library_tracks"));
    assert.ok(tables.some((row) => row.name === "focus_records"));
    assert.ok(tables.some((row) => row.name === "track_lyric_offsets"));
    assert.ok(!tables.some((row) => row.name.includes("credential")));
    initialized.database.close();
  });
});

test("imports local tracks without exposing paths in renderer models", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const mediaPath = join(directory, "Artist - Track.mp3");
    writeFileSync(mediaPath, "test audio");
    const result = store.importLocalFiles([{
      path: mediaPath,
      title: "Track",
      artist: "Artist",
      quickSignature: "fingerprint",
      size: 10,
      modifiedAt: 100
    }]);
    const track = store.listTracks()[0];
    assert.deepEqual(result, { imported: 1, updated: 0 });
    assert.equal(track?.title, "Track");
    assert.ok(track?.source.kind === "local");
    if (track?.source.kind === "local") {
      assert.equal(store.resolveLocalFile(track.source.fileToken), mediaPath);
      assert.ok(!JSON.stringify(track).includes(mediaPath));
    }
    store.close();
  });
});

test("persists queues and pending focus records", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    store.replaceQueue([{
      id: "queue-1",
      queuedAt: 100,
      track: {
        id: "track-1",
        title: "Forest rain",
        artist: "Local library",
        source: { kind: "local", fileToken: "opaque-file-token" }
      }
    }]);
    store.saveFocusRecord({
      clientRecordId: "focus-1",
      startedAt: 100,
      finishedAt: 200,
      plannedMinutes: 25,
      completedMinutes: 25,
      completedSeconds: 1_500,
      sceneCode: "mountain",
      timeKey: "morning",
      status: "completed",
      syncStatus: "pending",
      syncPolicy: "automatic",
      accountScope: "account:1"
    });

    assert.equal(store.readQueue()[0]?.track.title, "Forest rain");
    assert.equal(store.listPendingFocusRecords()[0]?.clientRecordId, "focus-1");
    store.saveFocusWorkspace({
      version: 1,
      accountScope: "account:1",
      todos: [{ id: "todo-1", text: "Read", done: false, updatedAt: 100 }],
      memoText: "Keep this local",
      updatedAt: 100
    });
    assert.equal(store.readFocusWorkspace("account:1")?.memoText, "Keep this local");
    store.close();
  });
});

test("persists entertainment tools independently and isolates malformed records", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const preferences = {
      version: 1 as const,
      toolId: "preferences" as const,
      soundEnabled: true,
      reducedMotion: false,
      solidBackground: false,
      lastToolId: "breathing" as const
    };
    const breathing = { version: 1 as const, toolId: "breathing" as const, elapsedMs: 12_000, completedRounds: 2 };

    store.saveEntertainmentState("preferences", preferences);
    store.saveEntertainmentState("breathing", breathing);
    assert.deepEqual(store.readEntertainmentState("preferences")?.state, preferences);
    assert.deepEqual(store.readEntertainmentState("breathing")?.state, breathing);

    initialized.database.prepare("UPDATE entertainment_state SET state_json = ? WHERE tool_id = ?").run("{broken", "breathing");
    assert.equal(store.readEntertainmentState("breathing"), undefined);
    assert.deepEqual(store.readEntertainmentState("preferences")?.state, preferences);
    assert.throws(() => store.saveEntertainmentState("preferences", {
      ...preferences,
      padding: "x".repeat(33 * 1_024)
    } as never), /ENTERTAINMENT_STATE_TOO_LARGE/);
    store.close();
  });
});

test("reconciles missing files and relocates them without exposing private paths", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const firstPath = join(directory, "First.mp3");
    const missingPath = join(directory, "Second.mp3");
    const replacementPath = join(directory, "moved", "Second.mp3");
    const file = (path: string, title: string, lyrics?: string) => ({
      path, title, artist: "Artist", album: "Album", durationMs: 90_000,
      lyrics, lyricsSource: lyrics ? "sidecar" as const : undefined,
      quickSignature: `fingerprint-${title}`, size: 10, modifiedAt: 100
    });

    store.reconcileLocalFiles(directory, [file(firstPath, "First"), file(missingPath, "Second")], true);
    const result = store.reconcileLocalFiles(directory, [file(firstPath, "First")], true);
    assert.equal(result.missing, 1);
    assert.equal(store.listTracks().length, 1);
    const missing = store.listMissingTracks()[0];
    assert.equal(missing?.track.title, "Second");
    assert.ok(!JSON.stringify(missing).includes(missingPath));

    const relocated = store.relocateLocalFile(missing!.track.id, file(replacementPath, "Second restored", "[00:01.00]Found"));
    assert.equal(relocated.title, "Second restored");
    assert.equal(store.listMissingTracks().length, 0);
    assert.deepEqual(store.getTrackLyrics(relocated.id), {
      trackId: relocated.id, content: "[00:01.00]Found", source: "sidecar"
    });
    assert.ok(!JSON.stringify(relocated).includes(replacementPath));
    store.close();
  });
});

test("persists and restores the ten-thousand-item queue limit", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const queue: QueueItem[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `queue-${index}`,
      queuedAt: index,
      track: {
        id: `track-${index}`,
        title: `Track ${index}`,
        artist: "Local library",
        source: { kind: "local", fileToken: `opaque-${index}` }
      }
    }));

    store.replaceQueue(queue);
    const restored = store.readQueue();
    assert.equal(restored.length, 10_000);
    assert.equal(restored[0]?.id, "queue-0");
    assert.equal(restored.at(-1)?.id, "queue-9999");
    const overLimitItem: QueueItem = { ...queue[0]!, id: "queue-over-limit" };
    assert.throws(() => store.replaceQueue([...queue, overLimitItem]), /QUEUE_LIMIT_EXCEEDED/);
    store.close();
  });
});

test("consolidates duplicate files into one track and falls back to another location", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studyroom-db-test-"));
  try {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const importer = new LocalLibraryImporter(store, async () => "same-full-content-hash");
    const firstPath = join(directory, "first.mp3");
    const secondPath = join(directory, "copy.mp3");
    writeFileSync(firstPath, "same audio");
    writeFileSync(secondPath, "same audio");
    const file = (path: string) => ({
      path, title: "Quiet", artist: "Artist", quickSignature: "same-quick-signature", size: 10, modifiedAt: 100
    });

    const first = await importer.import([file(firstPath)]);
    const second = await importer.import([file(secondPath)]);
    const tracks = store.listTracks();
    assert.equal(first.imported, 1);
    assert.equal(second.addedLocations, 1);
    assert.equal(tracks.length, 1);
    const source = tracks[0]?.source;
    assert.equal(source?.kind, "local");
    if (source?.kind === "local") {
      store.markLocationMissing(firstPath);
      assert.equal(store.resolveLocalFile(source.fileToken), secondPath);
    }
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("stores bounded playback history and returns recent distinct tracks", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const mediaPath = join(directory, "track.mp3");
    writeFileSync(mediaPath, "audio");
    store.importLocalFiles([{ path: mediaPath, title: "Recent", artist: "Artist", quickSignature: "quick", size: 5, modifiedAt: 1 }]);
    const track = store.listTracks()[0]!;
    store.recordPlaybackEvent({ sessionId: "00000000-0000-4000-8000-000000000001", trackId: track.id, state: "started", playedAt: 10 });
    store.recordPlaybackEvent({ sessionId: "00000000-0000-4000-8000-000000000001", trackId: track.id, state: "completed", playedAt: 20 });
    assert.deepEqual(store.listRecentTracks().map((entry) => entry.id), [track.id]);
    store.close();
  });
});

test("upgrades v4 local media without changing its renderer token", () => {
  withTemporaryDirectory((directory) => {
    const databasePath = join(directory, "studyroom.sqlite");
    const v4 = initializeLocalDatabase(databasePath, { migrations: DATABASE_MIGRATIONS.slice(0, 4) });
    const now = Date.now();
    v4.database.prepare(`
      INSERT INTO library_tracks(id, title, artist, source_json, created_at, updated_at)
      VALUES ('legacy-track', 'Legacy', 'Artist', '{"kind":"local","fileToken":"stable-token"}', ?, ?)
    `).run(now, now);
    v4.database.prepare(`
      INSERT INTO file_locations(track_id, file_token, fingerprint, last_seen_at, missing, local_path, file_size, modified_at)
      VALUES ('legacy-track', 'stable-token', 'legacy-fingerprint', ?, 0, ?, 5, 1)
    `).run(now, join(directory, "legacy.mp3"));
    v4.database.close();

    const upgraded = initializeLocalDatabase(databasePath);
    const store = new LocalDatabaseStore(upgraded.database);
    const track = store.listTracks()[0];
    assert.equal(upgraded.schemaVersion, 9);
    assert.deepEqual(track?.source, { kind: "local", fileToken: "stable-token" });
    store.close();
  });
});

test("upgrades legacy focus records as manual-only history", () => {
  withTemporaryDirectory((directory) => {
    const databasePath = join(directory, "studyroom.sqlite");
    const legacy = initializeLocalDatabase(databasePath, { migrations: DATABASE_MIGRATIONS.slice(0, 7) });
    legacy.database.prepare(`
      INSERT INTO focus_records(client_record_id, started_at, finished_at, planned_minutes, completed_minutes, status, sync_status, updated_at)
      VALUES ('legacy-focus', 100, 200, 25, 25, 'completed', 'pending', 200)
    `).run();
    legacy.database.close();

    const upgraded = initializeLocalDatabase(databasePath);
    const store = new LocalDatabaseStore(upgraded.database);
    assert.equal(upgraded.schemaVersion, 9);
    assert.equal((upgraded.database.prepare("SELECT activity_session_id FROM focus_records LIMIT 1").get() as { activity_session_id: string | null }).activity_session_id, null);
    assert.equal(store.listFocusRecords({ limit: 10 })[0]?.syncPolicy, "manual-only");
    assert.equal(store.listPendingFocusRecords().length, 0);
    store.close();
  });
});

test("restores the pre-migration file when an upgrade fails", () => {
  withTemporaryDirectory((directory) => {
    const databasePath = join(directory, "studyroom.sqlite");
    const original = new DatabaseSync(databasePath);
    original.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker(value) VALUES ('preserved'); PRAGMA user_version = 1;");
    original.close();

    const failingMigrations: DatabaseMigration[] = [
      { version: 2, name: "broken", sql: "CREATE TABLE invalid SQL" }
    ];
    assert.throws(() => initializeLocalDatabase(databasePath, {
      migrations: failingMigrations,
      now: () => 1_789_200_000_000
    }), /已恢复到迁移前状态/);

    const restored = new DatabaseSync(databasePath);
    const marker = restored.prepare("SELECT value FROM marker").get() as { value: string };
    assert.equal(marker.value, "preserved");
    assert.equal((restored.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
    restored.close();
    assert.ok(!readFileSync(databasePath).includes(Buffer.from("provider-secret")));
  });
});

test("preserves corrupted and future-version databases without writing to them", () => {
  withTemporaryDirectory((directory) => {
    const corruptedPath = join(directory, "corrupted.sqlite");
    writeFileSync(corruptedPath, "not a sqlite database");
    assert.throws(() => initializeLocalDatabase(corruptedPath, { now: () => 1_789_200_000_000 }), /原文件已保留/);
    assert.equal(readFileSync(corruptedPath, "utf8"), "not a sqlite database");

    const futurePath = join(directory, "future.sqlite");
    const future = new DatabaseSync(futurePath);
    future.exec("PRAGMA user_version = 99");
    future.close();
    assert.throws(() => initializeLocalDatabase(futurePath, { now: () => 1_789_200_000_100 }), /已阻止降级写入/);
    const reopened = new DatabaseSync(futurePath);
    assert.equal((reopened.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 99);
    reopened.close();
  });
});

const soundSettings = (): SoundSettings => ({
  version: 1,
  musicBus: { volume: 0.8, muted: false },
  ambientBus: { volume: 0.45, muted: false },
  ambientTracks: [{
    id: "ambient-rain",
    sourceId: "rain",
    volume: 0.35,
    pan: 0,
    muted: false,
    solo: false,
    fadeInMs: 800,
    fadeOutMs: 800,
    randomStart: true,
    status: "stopped"
  }],
  equalizer: {
    enabled: false,
    presetId: "flat",
    bands: [31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
      .map((frequencyHz) => ({ frequencyHz, gainDb: 0 }))
  },
  masterProcessing: {
    normalizationEnabled: false,
    lowVolumeCompensationEnabled: false,
    compressorEnabled: true
  },
  crossfadeSeconds: 4,
  visualizer: { mode: "spectrum", quality: "low" },
  outputDeviceId: "default"
});

test("upgrades v5 to lyric offsets without changing existing sound data", () => {
  withTemporaryDirectory((directory) => {
    const databasePath = join(directory, "studyroom.sqlite");
    const v5 = initializeLocalDatabase(databasePath, { migrations: DATABASE_MIGRATIONS.slice(0, 5) });
    v5.database.prepare(
      "INSERT INTO device_settings(setting_key, value_json, updated_at) VALUES ('marker', '{\"kept\":true}', 1)"
    ).run();
    v5.database.close();

    const upgraded = initializeLocalDatabase(databasePath);
    assert.equal(upgraded.schemaVersion, 9);
    assert.deepEqual(
      JSON.parse((upgraded.database.prepare("SELECT value_json FROM device_settings WHERE setting_key = 'marker'").get() as { value_json: string }).value_json),
      { kept: true }
    );
    assert.ok(upgraded.database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='track_lyric_offsets'"
    ).get());
    upgraded.database.close();
  });
});

test("persists sound settings and ignores damaged sound JSON", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const settings = soundSettings();
    store.saveSoundSettings(settings);
    assert.deepEqual(store.readSoundSettings(), settings);

    initialized.database.prepare(
      "UPDATE device_settings SET value_json = '{broken' WHERE setting_key = 'sound-center-v1'"
    ).run();
    assert.equal(store.readSoundSettings(), undefined);
    store.close();
  });
});

test("stores bounded sound snapshots and skips damaged snapshots", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const { version: _version, outputDeviceId: _outputDeviceId, ...state } = soundSettings();
    const first = store.saveSoundSnapshot({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Rain focus",
      state
    });
    assert.equal(first.name, "Rain focus");
    assert.equal(store.renameSoundSnapshot(first.id, "Quiet rain").name, "Quiet rain");

    for (let index = 2; index <= 20; index += 1) {
      store.saveSoundSnapshot({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        name: `Snapshot ${index}`,
        state
      });
    }
    assert.equal(store.listSoundSnapshots().length, 20);
    assert.throws(() => store.saveSoundSnapshot({
      id: "00000000-0000-4000-8000-000000000021",
      name: "Too many",
      state
    }), /SOUND_SNAPSHOT_LIMIT_EXCEEDED/);

    initialized.database.prepare(
      "UPDATE sound_snapshots SET mixer_json = '{broken' WHERE id = ?"
    ).run(first.id);
    assert.equal(store.listSoundSnapshots().some((entry) => entry.id === first.id), false);
    store.deleteSoundSnapshot(first.id);
    assert.throws(() => store.deleteSoundSnapshot(first.id), /SOUND_SNAPSHOT_NOT_FOUND/);
    store.close();
  });
});

test("manages favorites playlists and per-track lyric offsets transactionally", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const firstPath = join(directory, "first.mp3");
    const secondPath = join(directory, "second.mp3");
    writeFileSync(firstPath, "first");
    writeFileSync(secondPath, "second");
    store.importLocalFiles([
      { path: firstPath, title: "First", artist: "Artist", quickSignature: "first", size: 5, modifiedAt: 1 },
      { path: secondPath, title: "Second", artist: "Artist", quickSignature: "second", size: 6, modifiedAt: 2 }
    ]);
    const [first, second] = store.listTracks();
    assert.ok(first && second);

    assert.equal(store.setTrackFavorite(first.id, true), true);
    assert.equal(store.setTrackFavorite(first.id, true), true);
    assert.deepEqual(store.listFavoriteTracks().map((track) => track.id), [first.id]);
    assert.equal(store.setTrackFavorite(first.id, false), false);
    assert.equal(store.listFavoriteTracks().length, 0);

    const playlist = store.createPlaylist("Focus");
    assert.equal(store.renamePlaylist(playlist.id, "Deep focus").name, "Deep focus");
    store.addPlaylistTrack(playlist.id, first.id);
    store.addPlaylistTrack(playlist.id, second.id);
    store.addPlaylistTrack(playlist.id, first.id);
    assert.deepEqual(store.listPlaylistItems(playlist.id).map((item) => [item.track.id, item.position]), [
      [first.id, 0],
      [second.id, 1]
    ]);
    assert.deepEqual(store.removePlaylistTrack(playlist.id, first.id).map((item) => item.position), [0]);

    assert.equal(store.getTrackLyricOffset(second.id), 0);
    assert.equal(store.saveTrackLyricOffset(second.id, 1_500), 1_500);
    assert.equal(store.getTrackLyricOffset(second.id), 1_500);
    assert.equal(store.saveTrackLyricOffset(second.id, 0), 0);
    assert.equal(store.getTrackLyricOffset(second.id), 0);

    store.deletePlaylist(playlist.id);
    assert.equal(store.listPlaylists().length, 0);
    assert.throws(() => store.addPlaylistTrack(playlist.id, first.id), /PLAYLIST_NOT_FOUND/);
    assert.throws(() => store.setTrackFavorite("missing", true), /TRACK_NOT_FOUND/);
    store.close();
  });
});

test('failed update backup does not freeze or overwrite the live database', () => {
  withTemporaryDirectory(directory => {
    const initialized = initializeLocalDatabase(join(directory, 'studyroom.sqlite'));
    const store = new LocalDatabaseStore(initialized.database);
    try {
      store.setSetting('update-failure-preservation', { queue: ['synthetic-track'], volume: 0.37 });
      const blocked = join(directory, 'not-a-backup-directory');
      writeFileSync(blocked, 'owned synthetic blocking file');
      assert.throws(() => store.prepareUpdateBackup(blocked, {}));
      assert.equal(store.isUpdateFrozen(), false);
      assert.deepEqual(store.getSetting('update-failure-preservation'), { queue: ['synthetic-track'], volume: 0.37 });
      store.setSetting('after-failed-update-backup', true);
      assert.equal(store.getSetting('after-failed-update-backup'), true);
      assert.equal(readFileSync(blocked, 'utf8'), 'owned synthetic blocking file');
    } finally { store.close(); }
  });
});

test("stores schema v7 provider metadata without private fields or remote URLs", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    store.writeProviderMetadataCache("netease", "scope-a", "search:rain", { title: "Quiet Rain" }, 2_000);
    assert.deepEqual(store.readProviderMetadataCache("netease", "scope-a", "search:rain", 1_000), {
      value: { title: "Quiet Rain" }, expiresAt: 2_000, stale: false
    });
    assert.equal(store.readProviderMetadataCache("netease", "scope-a", "search:rain", 2_001)?.stale, true);
    assert.equal(store.readProviderMetadataCache("netease", "scope-b", "search:rain"), undefined);
    assert.throws(() => store.writeProviderMetadataCache("qq", "scope", "unsafe", { url: "https://example.invalid/audio" }, 2_000), /CACHE_REMOTE_URL_REJECTED/);
    assert.throws(() => store.writeProviderMetadataCache("qq", "scope", "unsafe", { cookie: "private" }, 2_000), /CACHE_PRIVATE_FIELD_REJECTED/);
    store.clearProviderMetadataCache("netease", "scope-a");
    assert.equal(store.readProviderMetadataCache("netease", "scope-a", "search:rain"), undefined);
    store.close();
  });
});

test("returns aggregate local profile counts without exposing stored records", () => {
  withTemporaryDirectory((directory) => {
    const initialized = initializeLocalDatabase(join(directory, "studyroom.sqlite"));
    const store = new LocalDatabaseStore(initialized.database);
    const mediaPath = join(directory, "private-track.mp3");
    writeFileSync(mediaPath, "audio");
    store.importLocalFiles([{
      path: mediaPath,
      title: "Private title",
      artist: "Private artist",
      quickSignature: "profile-count",
      size: 5,
      modifiedAt: 100
    }]);
    const track = store.listTracks()[0];
    assert.ok(track);
    store.replaceQueue([{ id: "queue-profile", track, queuedAt: 200 }]);
    store.createPlaylist("Private playlist");
    store.saveFocusRecord({
      clientRecordId: "00000000-0000-4000-8000-000000000099",
      startedAt: 300,
      finishedAt: 900,
      plannedMinutes: 10,
      completedMinutes: 10,
      status: "completed",
      syncStatus: "local"
    });
    store.saveEntertainmentState("preferences", {
      version: 1,
      toolId: "preferences",
      soundEnabled: true,
      reducedMotion: false,
      solidBackground: false
    });

    const summary = store.readLocalProfileCounts();

    assert.deepEqual(summary, {
      trackCount: 1,
      queueItemCount: 1,
      playlistCount: 1,
      focusRecordCount: 1,
      latestFocusAt: 900,
      hasEntertainmentSettings: true
    });
    assert.ok(!JSON.stringify(summary).includes(mediaPath));
    assert.ok(!JSON.stringify(summary).includes("Private title"));
    store.close();
  });
});
