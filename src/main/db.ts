import Database from 'better-sqlite3';
import { join } from 'path';
import { app } from 'electron';

const dbPath = join(app.getPath('userData'), 'karaoke.db');
const db = new Database(dbPath);

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
`);

export default db;
