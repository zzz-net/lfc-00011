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

    CREATE TABLE IF NOT EXISTS inventory_adjustment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES discrepancy_batch(id),
      line_id INTEGER NOT NULL REFERENCES discrepancy_line(id),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('increase','decrease')),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('original','compensation')),
      related_adjustment_id INTEGER DEFAULT NULL REFERENCES inventory_adjustment(id),
      operator TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disposition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL UNIQUE REFERENCES discrepancy_line(id),
      batch_id INTEGER NOT NULL REFERENCES discrepancy_batch(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted_loss','adjusted','recounted')),
      remark TEXT NOT NULL DEFAULT '',
      handler TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disposition_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL REFERENCES discrepancy_line(id),
      batch_id INTEGER NOT NULL REFERENCES discrepancy_batch(id),
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      handler TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_role (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'handler' CHECK(role IN ('approver','handler','admin'))
    );

    CREATE INDEX IF NOT EXISTS idx_discrepancy_line_batch ON discrepancy_line(batch_id);
    CREATE INDEX IF NOT EXISTS idx_discrepancy_line_sku ON discrepancy_line(sku);
    CREATE INDEX IF NOT EXISTS idx_discrepancy_line_diff_type ON discrepancy_line(diff_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_book_inventory_sku ON book_inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_physical_inventory_sku ON physical_inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_batch ON inventory_adjustment(batch_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_sku ON inventory_adjustment(sku);
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_created ON inventory_adjustment(created_at);
    CREATE INDEX IF NOT EXISTS idx_disposition_line ON disposition(line_id);
    CREATE INDEX IF NOT EXISTS idx_disposition_batch ON disposition(batch_id);
    CREATE INDEX IF NOT EXISTS idx_disposition_status ON disposition(status);
    CREATE INDEX IF NOT EXISTS idx_disposition_handler ON disposition(handler);
    CREATE INDEX IF NOT EXISTS idx_disposition_history_line ON disposition_history(line_id);
    CREATE INDEX IF NOT EXISTS idx_disposition_history_batch ON disposition_history(batch_id);
    CREATE INDEX IF NOT EXISTS idx_disposition_history_created ON disposition_history(created_at);

    CREATE TABLE IF NOT EXISTS stocktake_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      warehouse TEXT NOT NULL DEFAULT 'default',
      scope_type TEXT NOT NULL DEFAULT 'all' CHECK(scope_type IN ('all','by_category')),
      category TEXT DEFAULT NULL,
      plan_date TEXT NOT NULL,
      plan_end_date TEXT DEFAULT NULL,
      responsible_person TEXT NOT NULL DEFAULT '',
      executor TEXT DEFAULT NULL,
      recurrence_type TEXT NOT NULL DEFAULT 'once' CHECK(recurrence_type IN ('once','weekly','monthly')),
      recurrence_value TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
      created_by TEXT NOT NULL DEFAULT '',
      started_by TEXT DEFAULT NULL,
      completed_by TEXT DEFAULT NULL,
      cancelled_by TEXT DEFAULT NULL,
      cancel_reason TEXT DEFAULT NULL,
      remark TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT DEFAULT NULL,
      completed_at TEXT DEFAULT NULL,
      cancelled_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS stocktake_plan_import (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES stocktake_plan(id),
      import_type TEXT NOT NULL CHECK(import_type IN ('book','physical')),
      batch_no TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stocktake_plan_discrepancy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES stocktake_plan(id),
      batch_id INTEGER NOT NULL REFERENCES discrepancy_batch(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_warehouse ON stocktake_plan(warehouse);
    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_status ON stocktake_plan(status);
    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_date ON stocktake_plan(plan_date);
    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_import_plan ON stocktake_plan_import(plan_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stocktake_plan_import_unique ON stocktake_plan_import(plan_id, import_type, batch_no);
    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_discrepancy_plan ON stocktake_plan_discrepancy(plan_id);
    CREATE INDEX IF NOT EXISTS idx_stocktake_plan_discrepancy_batch ON stocktake_plan_discrepancy(batch_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stocktake_plan_discrepancy_unique ON stocktake_plan_discrepancy(plan_id, batch_id);

    CREATE TABLE IF NOT EXISTS inventory_alert_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('low_stock','over_stock','long_uncounted')),
      scope_type TEXT NOT NULL CHECK(scope_type IN ('sku','category','location')),
      scope_value TEXT NOT NULL,
      low_threshold INTEGER DEFAULT NULL,
      high_threshold INTEGER DEFAULT NULL,
      uncounted_days INTEGER DEFAULT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT '',
      remark TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_calculated_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_alert_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES inventory_alert_rule(id) ON DELETE CASCADE,
      inventory_id INTEGER NOT NULL REFERENCES current_inventory(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      current_qty INTEGER NOT NULL DEFAULT 0,
      threshold INTEGER NOT NULL,
      alert_value INTEGER NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_alert_rule_type ON inventory_alert_rule(alert_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_rule_scope ON inventory_alert_rule(scope_type, scope_value);
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_rule_enabled ON inventory_alert_rule(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_result_rule ON inventory_alert_result(rule_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_result_sku ON inventory_alert_result(sku);
    CREATE INDEX IF NOT EXISTS idx_inventory_alert_result_calculated ON inventory_alert_result(calculated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_alert_result_unique ON inventory_alert_result(rule_id, inventory_id, calculated_at);
  `)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
