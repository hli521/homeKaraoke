import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

const dbPath = join(app.getPath('userData'), 'karaoke.db')
const db = new Database(dbPath)

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    lastfm_id TEXT,
    region TEXT
  );

  CREATE TABLE IF NOT EXISTS mappings (
    song_id TEXT PRIMARY KEY,
    youtube_id TEXT NOT NULL,
    FOREIGN KEY(song_id) REFERENCES songs(id)
  );

  CREATE TABLE IF NOT EXISTS downloads (
    song_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(song_id) REFERENCES songs(id)
  );

  CREATE TABLE IF NOT EXISTS cached_songs (
    song_key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    audio_mode TEXT NOT NULL,
    youtube_id TEXT,
    audio_path TEXT,
    lyrics_json TEXT,
    lyrics_source TEXT,
    timing_version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`)

const columns = db.prepare('PRAGMA table_info(cached_songs)').all() as Array<{ name: string }>
if (!columns.some((column) => column.name === 'timing_version')) {
  db.exec('ALTER TABLE cached_songs ADD COLUMN timing_version INTEGER DEFAULT 1')
}

export default db
