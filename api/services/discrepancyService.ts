import { getDb } from '../db.js'
import { logAudit } from './auditService.js'
import { ensureDispositionForLines, getAllDispositionsByBatch, getDispositionHistoryByBatch } from './dispositionService.js'

export interface DiscrepancyBatch {
  id: number
  batch_no: string
  status: string
  created_by: string
  reviewed_by: string | null
  approved_by: string | null
  rolled_back_by: string | null
  rollback_reason: string | null
  created_at: string
  reviewed_at: string | null
  approved_at: string | null
  rolled_back_at: string | null
}

export interface DiscrepancyLine {
  id: number
  batch_id: number
  sku: string
  name: string
  book_qty: number
  physical_qty: number
  diff_qty: number
  diff_type: string
  unit: string
  location: string
}

export interface DiscrepancyBatchWithLines extends DiscrepancyBatch {
  lines: DiscrepancyLine[]
}

export interface DiscrepancyBatchWithCount extends DiscrepancyBatch {
  line_count: number
  surplus_count: number
  shortage_count: number
  missed_count: number
}

export function getDiscrepancyStats(): { surplus: number; shortage: number; missed: number } {
  const db = getDb()
  const row = db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN diff_type = 'surplus' THEN 1 ELSE 0 END), 0) as surplus,
      COALESCE(SUM(CASE WHEN diff_type = 'shortage' THEN 1 ELSE 0 END), 0) as shortage,
      COALESCE(SUM(CASE WHEN diff_type = 'missed' THEN 1 ELSE 0 END), 0) as missed
    FROM discrepancy_line`
  ).get() as { surplus: number; shortage: number; missed: number }
  return row
}

export interface DashboardStats {
  diffAmountDistribution: {
    surplus: { count: number; totalAbsQty: number }
    shortage: { count: number; totalAbsQty: number }
    missed: { count: number; totalAbsQty: number }
  }
  dispositionStatusDistribution: Array<{
    status: string
    count: number
    percentage: number
  }>
  recentApprovalRate: {
    totalBatches: number
    reviewedBatches: number
    approvedBatches: number
    reviewPassRate: number
    approvalRate: number
  }
  totalBatches: number
  totalLines: number
  inventoryStats: {
    skuCount: number
    totalQuantity: number
  }
}

export function getDashboardStats(): DashboardStats {
  const db = getDb()

  // 1. 盘盈盘亏金额分布（用差异数量绝对值作为"金额"代理指标）
  const amountRow = db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN diff_type = 'surplus' THEN 1 ELSE 0 END), 0) as surplus_count,
      COALESCE(SUM(CASE WHEN diff_type = 'surplus' THEN ABS(diff_qty) ELSE 0 END), 0) as surplus_qty,
      COALESCE(SUM(CASE WHEN diff_type = 'shortage' THEN 1 ELSE 0 END), 0) as shortage_count,
      COALESCE(SUM(CASE WHEN diff_type = 'shortage' THEN ABS(diff_qty) ELSE 0 END), 0) as shortage_qty,
      COALESCE(SUM(CASE WHEN diff_type = 'missed' THEN 1 ELSE 0 END), 0) as missed_count,
      COALESCE(SUM(CASE WHEN diff_type = 'missed' THEN ABS(diff_qty) ELSE 0 END), 0) as missed_qty
    FROM discrepancy_line`
  ).get() as {
    surplus_count: number; surplus_qty: number
    shortage_count: number; shortage_qty: number
    missed_count: number; missed_qty: number
  }

  // 2. 各处置状态占比
  const dispRows = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM disposition GROUP BY status ORDER BY cnt DESC`
  ).all() as Array<{ status: string; cnt: number }>

  const totalDisp = dispRows.reduce((s, r) => s + r.cnt, 0)
  const dispositionStatusDistribution = dispRows.map(r => ({
    status: r.status,
    count: r.cnt,
    percentage: totalDisp > 0 ? Math.round((r.cnt / totalDisp) * 10000) / 100 : 0
  }))

  // 如果没有任何记录，补一个pending的0值
  if (dispositionStatusDistribution.length === 0) {
    dispositionStatusDistribution.push({ status: 'pending', count: 0, percentage: 0 })
  }

  // 3. 最近批次审批通过率（取最近10个批次）
  const recentBatches = db.prepare(
    `SELECT status FROM discrepancy_batch ORDER BY created_at DESC LIMIT 10`
  ).all() as Array<{ status: string }>

  const totalBatches = recentBatches.length
  const reviewedBatches = recentBatches.filter(b => ['reviewed', 'approved', 'rolled_back'].includes(b.status)).length
  const approvedBatches = recentBatches.filter(b => ['approved', 'rolled_back'].includes(b.status)).length
  const reviewPassRate = reviewedBatches > 0
    ? Math.round((reviewedBatches / (totalBatches > 0 ? totalBatches : 1)) * 10000) / 100
    : 0
  const approvalRate = totalBatches > 0
    ? Math.round((approvedBatches / totalBatches) * 10000) / 100
    : 0

  // 4. 总体统计
  const totalBatchesAll = (db.prepare('SELECT COUNT(*) as cnt FROM discrepancy_batch').get() as { cnt: number }).cnt
  const totalLines = (db.prepare('SELECT COUNT(*) as cnt FROM discrepancy_line').get() as { cnt: number }).cnt

  // 5. 库存统计
  const invRow = db.prepare(
    `SELECT COUNT(*) as sku_count, COALESCE(SUM(quantity), 0) as total_qty FROM current_inventory`
  ).get() as { sku_count: number; total_qty: number }

  return {
    diffAmountDistribution: {
      surplus: { count: amountRow.surplus_count, totalAbsQty: amountRow.surplus_qty },
      shortage: { count: amountRow.shortage_count, totalAbsQty: amountRow.shortage_qty },
      missed: { count: amountRow.missed_count, totalAbsQty: amountRow.missed_qty },
    },
    dispositionStatusDistribution,
    recentApprovalRate: {
      totalBatches,
      reviewedBatches,
      approvedBatches,
      reviewPassRate,
      approvalRate,
    },
    totalBatches: totalBatchesAll,
    totalLines,
    inventoryStats: {
      skuCount: invRow.sku_count,
      totalQuantity: invRow.total_qty,
    },
  }
}

export function calculateDiscrepancy(createdBy: string): DiscrepancyBatchWithLines {
  const db = getDb()

  const bookRows = db.prepare(
    `SELECT sku, name, quantity, unit, location FROM book_inventory`
  ).all() as { sku: string; name: string; quantity: number; unit: string; location: string }[]

  const physicalRows = db.prepare(
    `SELECT sku, name, quantity, unit, location FROM physical_inventory`
  ).all() as { sku: string; name: string; quantity: number; unit: string; location: string }[]

  const bookMap = new Map<string, { name: string; quantity: number; unit: string; location: string }>()
  for (const row of bookRows) {
    const existing = bookMap.get(row.sku)
    if (existing) {
      existing.quantity += row.quantity
    } else {
      bookMap.set(row.sku, { name: row.name, quantity: row.quantity, unit: row.unit, location: row.location })
    }
  }

  const physicalMap = new Map<string, { name: string; quantity: number; unit: string; location: string }>()
  for (const row of physicalRows) {
    const existing = physicalMap.get(row.sku)
    if (existing) {
      existing.quantity += row.quantity
    } else {
      physicalMap.set(row.sku, { name: row.name, quantity: row.quantity, unit: row.unit, location: row.location })
    }
  }

  const allSkus = new Set([...bookMap.keys(), ...physicalMap.keys()])
  const lines: Omit<DiscrepancyLine, 'id' | 'batch_id'>[] = []

  for (const sku of allSkus) {
    const book = bookMap.get(sku)
    const physical = physicalMap.get(sku)

    const bookQty = book ? book.quantity : 0
    const physicalQty = physical ? physical.quantity : 0
    const diffQty = physicalQty - bookQty

    if (diffQty === 0) continue

    let diffType: string
    if (!physical) {
      diffType = 'missed'
    } else if (diffQty > 0) {
      diffType = 'surplus'
    } else {
      diffType = 'shortage'
    }

    const name = book?.name || physical?.name || ''
    const unit = book?.unit || physical?.unit || ''
    const location = book?.location || physical?.location || ''

    lines.push({ sku, name, book_qty: bookQty, physical_qty: physicalQty, diff_qty: diffQty, diff_type: diffType, unit, location })
  }

  const batchNo = 'DIFF-' + Date.now()

  const result = db.transaction(() => {
    const batchInfo = db.prepare(
      `INSERT INTO discrepancy_batch (batch_no, status, created_by) VALUES (?, 'pending_review', ?)`
    ).run(batchNo, createdBy)

    const batchId = batchInfo.lastInsertRowid as number
    const insertLine = db.prepare(
      `INSERT INTO discrepancy_line (batch_id, sku, name, book_qty, physical_qty, diff_qty, diff_type, unit, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const line of lines) {
      insertLine.run(batchId, line.sku, line.name, line.book_qty, line.physical_qty, line.diff_qty, line.diff_type, line.unit, line.location)
    }

    logAudit('calculate_discrepancy', 'discrepancy_batch', batchId, createdBy, `batch=${batchNo}, lines=${lines.length}`)

    const batch = db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(batchId) as DiscrepancyBatch
    const insertedLines = db.prepare('SELECT * FROM discrepancy_line WHERE batch_id = ?').all(batchId) as DiscrepancyLine[]

    return { ...batch, lines: insertedLines }
  })()

  return result
}

export function getDiscrepancies(): DiscrepancyBatchWithCount[] {
  const db = getDb()
  return db.prepare(
    `SELECT b.*,
      COUNT(l.id) as line_count,
      COALESCE(SUM(CASE WHEN l.diff_type = 'surplus' THEN 1 ELSE 0 END), 0) as surplus_count,
      COALESCE(SUM(CASE WHEN l.diff_type = 'shortage' THEN 1 ELSE 0 END), 0) as shortage_count,
      COALESCE(SUM(CASE WHEN l.diff_type = 'missed' THEN 1 ELSE 0 END), 0) as missed_count
    FROM discrepancy_batch b
    LEFT JOIN discrepancy_line l ON b.id = l.batch_id
    GROUP BY b.id
    ORDER BY b.created_at DESC`
  ).all() as DiscrepancyBatchWithCount[]
}

export function getDiscrepancyById(id: number): DiscrepancyBatchWithLines | null {
  const db = getDb()
  const batch = db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch | undefined
  if (!batch) return null
  const lines = db.prepare('SELECT * FROM discrepancy_line WHERE batch_id = ?').all(id) as DiscrepancyLine[]

  ensureDispositionForLines(id)

  const dispositions = getAllDispositionsByBatch(id)
  const dispMap = new Map(dispositions.map(d => [d.line_id, d]))

  const linesWithDisposition = lines.map(l => ({
    ...l,
    disposition: dispMap.get(l.id) || null,
  }))

  return { ...batch, lines: linesWithDisposition }
}

export function reviewDiscrepancy(id: number, reviewedBy: string, pass: boolean): DiscrepancyBatch | null {
  const db = getDb()
  const batch = db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch | undefined
  if (!batch) return null

  if (pass) {
    db.prepare(
      `UPDATE discrepancy_batch SET reviewed_by = ?, reviewed_at = datetime('now'), status = 'reviewed' WHERE id = ?`
    ).run(reviewedBy, id)
    logAudit('review_discrepancy', 'discrepancy_batch', id, reviewedBy, `batch=${batch.batch_no}, pass=true`)
  } else {
    db.prepare(
      `UPDATE discrepancy_batch SET reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
    ).run(reviewedBy, id)
    logAudit('review_discrepancy', 'discrepancy_batch', id, reviewedBy, `batch=${batch.batch_no}, pass=false (rejected)`)
  }

  return db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch
}

export function approveDiscrepancy(id: number, approvedBy: string): DiscrepancyBatch | null {
  const db = getDb()
  const batch = db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch | undefined
  if (!batch) return null
  if (batch.status !== 'reviewed') {
    throw new Error('只有已审核的差异批次才能审批')
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE discrepancy_batch SET approved_by = ?, approved_at = datetime('now'), status = 'approved' WHERE id = ?`
    ).run(approvedBy, id)

    const lines = db.prepare('SELECT * FROM discrepancy_line WHERE batch_id = ?').all(id) as DiscrepancyLine[]
    const insertAdjustment = db.prepare(
      `INSERT INTO inventory_adjustment (batch_id, line_id, sku, name, direction, quantity, adjustment_type, operator, reason) VALUES (?, ?, ?, ?, ?, ?, 'original', ?, '审批通过，调整库存')`
    )

    for (const line of lines) {
      const direction = line.diff_qty > 0 ? 'increase' : 'decrease'
      const absQty = Math.abs(line.diff_qty)
      insertAdjustment.run(id, line.id, line.sku, line.name, direction, absQty, approvedBy)

      const existing = db.prepare('SELECT * FROM current_inventory WHERE sku = ?').get(line.sku) as { quantity: number } | undefined
      if (existing) {
        db.prepare('UPDATE current_inventory SET quantity = quantity + ? WHERE sku = ?').run(line.diff_qty, line.sku)
      } else {
        db.prepare(
          `INSERT INTO current_inventory (sku, name, quantity, unit, location) VALUES (?, ?, ?, ?, ?)`
        ).run(line.sku, line.name, line.diff_qty, line.unit, line.location)
      }
    }

    logAudit('approve_discrepancy', 'discrepancy_batch', id, approvedBy, `batch=${batch.batch_no}, adjusted ${lines.length} items`)
  })

  transaction()
  return db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch
}

export function rollbackDiscrepancy(id: number, rolledBackBy: string, reason: string): DiscrepancyBatch | null {
  const db = getDb()
  const batch = db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch | undefined
  if (!batch) return null
  if (batch.status !== 'approved') {
    throw new Error('只有已审批的差异批次才能回滚')
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE discrepancy_batch SET rolled_back_by = ?, rolled_back_at = datetime('now'), status = 'rolled_back', rollback_reason = ? WHERE id = ?`
    ).run(rolledBackBy, reason, id)

    const originalAdjustments = db.prepare(
      `SELECT * FROM inventory_adjustment WHERE batch_id = ? AND adjustment_type = 'original'`
    ).all(id) as { id: number; line_id: number; sku: string; name: string; direction: string; quantity: number }[]

    const insertAdjustment = db.prepare(
      `INSERT INTO inventory_adjustment (batch_id, line_id, sku, name, direction, quantity, adjustment_type, related_adjustment_id, operator, reason) VALUES (?, ?, ?, ?, ?, ?, 'compensation', ?, ?, ?)`
    )

    for (const adj of originalAdjustments) {
      const compDirection = adj.direction === 'increase' ? 'decrease' : 'increase'
      insertAdjustment.run(id, adj.line_id, adj.sku, adj.name, compDirection, adj.quantity, adj.id, rolledBackBy, reason)

      const existing = db.prepare('SELECT * FROM current_inventory WHERE sku = ?').get(adj.sku) as { quantity: number } | undefined
      if (existing) {
        const delta = adj.direction === 'increase' ? -adj.quantity : adj.quantity
        db.prepare('UPDATE current_inventory SET quantity = quantity + ? WHERE sku = ?').run(delta, adj.sku)
      }
    }

    logAudit('rollback_discrepancy', 'discrepancy_batch', id, rolledBackBy, `batch=${batch.batch_no}, reason=${reason}, compensations=${originalAdjustments.length}`)
  })

  transaction()
  return db.prepare('SELECT * FROM discrepancy_batch WHERE id = ?').get(id) as DiscrepancyBatch
}

export interface InventoryAdjustment {
  id: number
  batch_id: number
  line_id: number
  sku: string
  name: string
  direction: 'increase' | 'decrease'
  quantity: number
  adjustment_type: 'original' | 'compensation'
  related_adjustment_id: number | null
  operator: string
  reason: string
  created_at: string
}

export interface AuditLogEntry {
  id: number
  action: string
  entity_type: string
  entity_id: number
  operator: string
  detail: string
  created_at: string
}

export interface FullDiscrepancyExport {
  batch: DiscrepancyBatch
  lines: DiscrepancyLine[]
  adjustments: InventoryAdjustment[]
  auditLogs: AuditLogEntry[]
  dispositions: ReturnType<typeof getAllDispositionsByBatch>
  dispositionHistory: ReturnType<typeof getDispositionHistoryByBatch>
}

export function getAdjustmentsByBatch(batchId: number): InventoryAdjustment[] {
  const db = getDb()
  return db.prepare(
    `SELECT * FROM inventory_adjustment WHERE batch_id = ? ORDER BY created_at ASC, id ASC`
  ).all(batchId) as InventoryAdjustment[]
}

export function exportDiscrepancy(id: number): FullDiscrepancyExport | null {
  const batch = getDiscrepancyById(id)
  if (!batch) return null

  const db = getDb()
  const adjustments = db.prepare(
    `SELECT * FROM inventory_adjustment WHERE batch_id = ? ORDER BY created_at ASC, id ASC`
  ).all(id) as InventoryAdjustment[]

  const auditLogs = db.prepare(
    `SELECT * FROM audit_log WHERE entity_type = 'discrepancy_batch' AND entity_id = ? ORDER BY created_at ASC, id ASC`
  ).all(id) as AuditLogEntry[]

  const dispositions = getAllDispositionsByBatch(id)
  const dispositionHistory = getDispositionHistoryByBatch(id)

  return {
    batch: batch as DiscrepancyBatch,
    lines: batch.lines,
    adjustments,
    auditLogs,
    dispositions,
    dispositionHistory,
  }
}
