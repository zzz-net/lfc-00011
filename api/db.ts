import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = path.join(__dirname, '..', 'data', 'inventory.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables(db)
  }
  return db
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity >= 0),
      unit TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      batch_no TEXT NOT NULL,
      imported_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS physical_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity >= 0),
      unit TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      batch_no TEXT NOT NULL,
      imported_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discrepancy_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','reviewed','approved','rolled_back')),
      created_by TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT DEFAULT NULL,
      approved_by TEXT DEFAULT NULL,
      rolled_back_by TEXT DEFAULT NULL,
      rollback_reason TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT DEFAULT NULL,
      approved_at TEXT DEFAULT NULL,
      rolled_back_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS discrepancy_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES discrepancy_batch(id),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      book_qty INTEGER NOT NULL DEFAULT 0,
      physical_qty INTEGER NOT NULL DEFAULT 0,
      diff_qty INTEGER NOT NULL DEFAULT 0,
      diff_type TEXT NOT NULL CHECK(diff_type IN ('surplus','shortage','missed')),
      unit TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS current_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_discrepancy_line_batch ON discrepancy_line(batch_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_book_inventory_sku ON book_inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_physical_inventory_sku ON physical_inventory(sku);
  `)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
