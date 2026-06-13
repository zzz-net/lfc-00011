import { getDb } from '../db.js'

export interface AuditLog {
  id: number
  action: string
  entity_type: string
  entity_id: number
  operator: string
  detail: string
  created_at: string
}

export function logAudit(
  action: string,
  entityType: string,
  entityId: number,
  operator: string,
  detail: string
): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO audit_log (action, entity_type, entity_id, operator, detail) VALUES (?, ?, ?, ?, ?)`
  ).run(action, entityType, entityId, operator, detail)
}

export function getAuditLogs(
  page: number = 1,
  pageSize: number = 20
): { data: AuditLog[]; total: number } {
  const db = getDb()
  const offset = (page - 1) * pageSize
  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }
  const data = db
    .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(pageSize, offset) as AuditLog[]
  return { data, total: total.count }
}

export function exportAuditLogs(): AuditLog[] {
  const db = getDb()
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC').all() as AuditLog[]
}
