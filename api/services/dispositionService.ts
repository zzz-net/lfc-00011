import { getDb } from '../db.js'
import { logAudit } from './auditService.js'

export interface Disposition {
  id: number
  line_id: number
  batch_id: number
  status: string
  remark: string
  handler: string
  created_at: string
  updated_at: string
}

export interface DispositionHistoryEntry {
  id: number
  line_id: number
  batch_id: number
  from_status: string
  to_status: string
  remark: string
  handler: string
  operator: string
  created_at: string
}

export interface UserRole {
  id: number
  username: string
  role: string
}

export type DispositionStatus = 'pending' | 'accepted_loss' | 'adjusted' | 'recounted'

const VALID_STATUSES: DispositionStatus[] = ['pending', 'accepted_loss', 'adjusted', 'recounted']

export function getUserRole(username: string): UserRole | null {
  const db = getDb()
  return db.prepare('SELECT * FROM user_role WHERE username = ?').get(username) as UserRole | null
}

export function setUserRole(username: string, role: string): UserRole {
  const db = getDb()
  const validRoles = ['approver', 'handler', 'admin']
  if (!validRoles.includes(role)) {
    throw new Error(`无效角色: ${role}，有效值为: ${validRoles.join(', ')}`)
  }
  db.prepare(
    `INSERT INTO user_role (username, role) VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET role = excluded.role`
  ).run(username, role)
  return db.prepare('SELECT * FROM user_role WHERE username = ?').get(username) as UserRole
}

export function checkDispositionPermission(operator: string, batchId: number): void {
  const roleRow = getUserRole(operator)
  if (!roleRow) {
    throw new Error(`用户 ${operator} 未分配角色，请联系管理员设置角色`)
  }
  if (roleRow.role === 'approver') {
    throw new Error('审批人不能执行处置操作，需由处置人操作')
  }

  const db = getDb()
  const batch = db.prepare('SELECT approved_by FROM discrepancy_batch WHERE id = ?').get(batchId) as { approved_by: string | null } | undefined
  if (batch && batch.approved_by === operator) {
    throw new Error('审批人与处置人不能是同一人')
  }
}

export function setDisposition(
  lineId: number,
  batchId: number,
  status: DispositionStatus,
  remark: string,
  handler: string,
  operator: string
): Disposition {
  const db = getDb()

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`无效处置状态: ${status}`)
  }

  const line = db.prepare('SELECT * FROM discrepancy_line WHERE id = ? AND batch_id = ?').get(lineId, batchId)
  if (!line) {
    throw new Error('差异行不存在')
  }

  checkDispositionPermission(operator, batchId)

  return db.transaction(() => {
    const existing = db.prepare('SELECT * FROM disposition WHERE line_id = ?').get(lineId) as Disposition | undefined

    const fromStatus = existing ? existing.status : 'pending'

    if (existing) {
      db.prepare(
        `UPDATE disposition SET status = ?, remark = ?, handler = ?, updated_at = datetime('now') WHERE line_id = ?`
      ).run(status, remark, handler, lineId)
    } else {
      db.prepare(
        `INSERT INTO disposition (line_id, batch_id, status, remark, handler) VALUES (?, ?, ?, ?, ?)`
      ).run(lineId, batchId, status, remark, handler)
    }

    db.prepare(
      `INSERT INTO disposition_history (line_id, batch_id, from_status, to_status, remark, handler, operator)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(lineId, batchId, fromStatus, status, remark, handler, operator)

    logAudit(
      'set_disposition',
      'discrepancy_line',
      lineId,
      operator,
      `batch_id=${batchId}, ${fromStatus}->${status}, handler=${handler}, remark=${remark}`
    )

    return db.prepare('SELECT * FROM disposition WHERE line_id = ?').get(lineId) as Disposition
  })()
}

export function batchSetDisposition(
  lineIds: number[],
  batchId: number,
  status: DispositionStatus,
  remark: string,
  handler: string,
  operator: string
): Disposition[] {
  checkDispositionPermission(operator, batchId)

  const results: Disposition[] = []
  const db = getDb()

  const tx = db.transaction(() => {
    for (const lineId of lineIds) {
      const result = setDisposition(lineId, batchId, status, remark, handler, operator)
      results.push(result)
    }
  })

  tx()
  return results
}

export interface DispositionFilter {
  batchId?: number
  status?: string
  sku?: string
  page?: number
  pageSize?: number
}

export function getDispositions(filter: DispositionFilter): { data: (Disposition & { sku: string; name: string; diff_type: string })[]; total: number } {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.batchId) {
    conditions.push('d.batch_id = ?')
    params.push(filter.batchId)
  }
  if (filter.status) {
    conditions.push('d.status = ?')
    params.push(filter.status)
  }
  if (filter.sku) {
    conditions.push('l.sku LIKE ?')
    params.push(`%${filter.sku}%`)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
  const pageSize = filter.pageSize || 50
  const page = filter.page || 1
  const offset = (page - 1) * pageSize

  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM disposition d JOIN discrepancy_line l ON d.line_id = l.id ${whereClause}`
  ).get(...params) as { cnt: number }

  const rows = db.prepare(
    `SELECT d.*, l.sku, l.name, l.diff_type
     FROM disposition d
     JOIN discrepancy_line l ON d.line_id = l.id
     ${whereClause}
     ORDER BY d.updated_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as (Disposition & { sku: string; name: string; diff_type: string })[]

  return { data: rows, total: countRow.cnt }
}

export function getDispositionByLine(lineId: number): Disposition | null {
  const db = getDb()
  return db.prepare('SELECT * FROM disposition WHERE line_id = ?').get(lineId) as Disposition | null
}

export function getDispositionHistory(lineId: number): DispositionHistoryEntry[] {
  const db = getDb()
  return db.prepare(
    `SELECT * FROM disposition_history WHERE line_id = ? ORDER BY created_at ASC, id ASC`
  ).all(lineId) as DispositionHistoryEntry[]
}

export function getDispositionHistoryByBatch(batchId: number): DispositionHistoryEntry[] {
  const db = getDb()
  return db.prepare(
    `SELECT * FROM disposition_history WHERE batch_id = ? ORDER BY created_at ASC, id ASC`
  ).all(batchId) as DispositionHistoryEntry[]
}

export function getAllDispositionsByBatch(batchId: number): Disposition[] {
  const db = getDb()
  return db.prepare(
    `SELECT * FROM disposition WHERE batch_id = ?`
  ).all(batchId) as Disposition[]
}

export function ensureDispositionForLines(batchId: number): void {
  const db = getDb()
  const lines = db.prepare('SELECT id FROM discrepancy_line WHERE batch_id = ?').all(batchId) as { id: number }[]
  const existing = db.prepare('SELECT line_id FROM disposition WHERE batch_id = ?').all(batchId) as { line_id: number }[]
  const existingSet = new Set(existing.map(e => e.line_id))

  const insert = db.prepare(
    `INSERT OR IGNORE INTO disposition (line_id, batch_id, status, remark, handler) VALUES (?, ?, 'pending', '', '')`
  )

  for (const line of lines) {
    if (!existingSet.has(line.id)) {
      insert.run(line.id, batchId)
    }
  }
}
