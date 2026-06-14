import { getDb } from '../db.js'
import { logAudit } from './auditService.js'
import type { StocktakePlan, PlanStatus, PlanScopeType, PlanRecurrenceType } from '@shared/types'

function generatePlanNo(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `PLAN-${dateStr}-${random}`
}

function checkPlanConflict(
  warehouse: string,
  planDate: string,
  planEndDate: string | null,
  excludeId?: number
): boolean {
  const db = getDb()
  const endDate = planEndDate || planDate

  let sql = `
    SELECT COUNT(*) as count FROM stocktake_plan
    WHERE warehouse = ?
      AND status IN ('pending', 'in_progress')
      AND (
        (plan_date <= ? AND (plan_end_date IS NULL OR plan_end_date >= ?))
        OR (plan_date <= ? AND (plan_end_date IS NULL OR plan_end_date >= ?))
        OR (plan_date >= ? AND plan_date <= ?)
      )
  `
  const params: unknown[] = [warehouse, planDate, planDate, endDate, endDate, planDate, endDate]

  if (excludeId) {
    sql += ' AND id != ?'
    params.push(excludeId)
  }

  const result = db.prepare(sql).get(...params) as { count: number }
  return result.count > 0
}

export interface CreatePlanParams {
  name: string
  warehouse?: string
  scopeType: PlanScopeType
  category?: string | null
  planDate: string
  planEndDate?: string | null
  responsiblePerson: string
  executor?: string | null
  recurrenceType: PlanRecurrenceType
  recurrenceValue?: string | null
  remark?: string | null
  createdBy: string
}

export function createPlan(params: CreatePlanParams): StocktakePlan {
  const db = getDb()

  if (!params.name) {
    throw new Error('计划名称不能为空')
  }
  if (!params.planDate) {
    throw new Error('计划日期不能为空')
  }
  if (!params.responsiblePerson) {
    throw new Error('负责人不能为空')
  }
  if (!params.createdBy) {
    throw new Error('创建人不能为空')
  }
  if (params.scopeType === 'by_category' && !params.category) {
    throw new Error('按类别盘点时必须指定类别')
  }

  const warehouse = params.warehouse || 'default'

  if (checkPlanConflict(warehouse, params.planDate, params.planEndDate || null)) {
    throw new Error('同一仓库同一时段存在进行中或待开始的盘点计划，时间冲突')
  }

  const planNo = generatePlanNo()

  const stmt = db.prepare(`
    INSERT INTO stocktake_plan (
      plan_no, name, warehouse, scope_type, category,
      plan_date, plan_end_date, responsible_person, executor,
      recurrence_type, recurrence_value, status, created_by, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `)

  const result = stmt.run(
    planNo,
    params.name,
    warehouse,
    params.scopeType,
    params.category || null,
    params.planDate,
    params.planEndDate || null,
    params.responsiblePerson,
    params.executor || null,
    params.recurrenceType,
    params.recurrenceValue || null,
    params.createdBy,
    params.remark || null
  )

  const plan = getPlanById(result.lastInsertRowid as number)
  if (!plan) {
    throw new Error('创建计划失败')
  }

  logAudit(
    'create_plan',
    'stocktake_plan',
    plan.id,
    params.createdBy,
    `创建盘点计划: ${params.name}`
  )

  return plan
}

export function getPlanById(id: number): StocktakePlan | null {
  const db = getDb()
  const plan = db.prepare('SELECT * FROM stocktake_plan WHERE id = ?').get(id) as StocktakePlan | undefined
  return plan || null
}

export function getPlanByNo(planNo: string): StocktakePlan | null {
  const db = getDb()
  const plan = db.prepare('SELECT * FROM stocktake_plan WHERE plan_no = ?').get(planNo) as StocktakePlan | undefined
  return plan || null
}

export interface PlanListFilters {
  status?: PlanStatus
  warehouse?: string
  createdBy?: string
  executor?: string
  page?: number
  pageSize?: number
}

export function getPlanList(filters: PlanListFilters = {}): { data: StocktakePlan[]; total: number } {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.status) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  if (filters.warehouse) {
    conditions.push('warehouse = ?')
    params.push(filters.warehouse)
  }
  if (filters.createdBy) {
    conditions.push('created_by = ?')
    params.push(filters.createdBy)
  }
  if (filters.executor) {
    conditions.push('executor = ?')
    params.push(filters.executor)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const countSql = `SELECT COUNT(*) as count FROM stocktake_plan ${whereClause}`
  const totalResult = db.prepare(countSql).get(...params) as { count: number }

  const page = filters.page || 1
  const pageSize = filters.pageSize || 20
  const offset = (page - 1) * pageSize

  const listSql = `
    SELECT * FROM stocktake_plan
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `
  const data = db.prepare(listSql).all(...params, pageSize, offset) as StocktakePlan[]

  return { data, total: totalResult.count }
}

export interface UpdatePlanParams {
  name?: string
  scopeType?: PlanScopeType
  category?: string | null
  planDate?: string
  planEndDate?: string | null
  responsiblePerson?: string
  executor?: string | null
  recurrenceType?: PlanRecurrenceType
  recurrenceValue?: string | null
  remark?: string | null
}

export function updatePlan(id: number, params: UpdatePlanParams, operator: string): StocktakePlan {
  const db = getDb()
  const plan = getPlanById(id)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'pending') {
    throw new Error('只有待开始状态的计划可以修改')
  }

  if (plan.created_by !== operator) {
    throw new Error('只有计划创建人可以修改计划')
  }

  const updates: string[] = []
  const updateParams: unknown[] = []

  if (params.name !== undefined) {
    if (!params.name) throw new Error('计划名称不能为空')
    updates.push('name = ?')
    updateParams.push(params.name)
  }
  if (params.scopeType !== undefined) {
    updates.push('scope_type = ?')
    updateParams.push(params.scopeType)
  }
  if (params.category !== undefined) {
    updates.push('category = ?')
    updateParams.push(params.category || null)
  }
  if (params.planDate !== undefined) {
    if (!params.planDate) throw new Error('计划日期不能为空')
    updates.push('plan_date = ?')
    updateParams.push(params.planDate)
  }
  if (params.planEndDate !== undefined) {
    updates.push('plan_end_date = ?')
    updateParams.push(params.planEndDate || null)
  }
  if (params.responsiblePerson !== undefined) {
    if (!params.responsiblePerson) throw new Error('负责人不能为空')
    updates.push('responsible_person = ?')
    updateParams.push(params.responsiblePerson)
  }
  if (params.executor !== undefined) {
    updates.push('executor = ?')
    updateParams.push(params.executor || null)
  }
  if (params.recurrenceType !== undefined) {
    updates.push('recurrence_type = ?')
    updateParams.push(params.recurrenceType)
  }
  if (params.recurrenceValue !== undefined) {
    updates.push('recurrence_value = ?')
    updateParams.push(params.recurrenceValue || null)
  }
  if (params.remark !== undefined) {
    updates.push('remark = ?')
    updateParams.push(params.remark || null)
  }

  if (updates.length === 0) {
    return plan
  }

  updates.push("updated_at = datetime('now')")

  const newPlanDate = params.planDate || plan.plan_date
  const newPlanEndDate = params.planEndDate !== undefined ? params.planEndDate : plan.plan_end_date
  if (params.planDate !== undefined || params.planEndDate !== undefined) {
    if (checkPlanConflict(plan.warehouse, newPlanDate, newPlanEndDate || null, id)) {
      throw new Error('同一仓库同一时段存在进行中或待开始的盘点计划，时间冲突')
    }
  }

  const sql = `UPDATE stocktake_plan SET ${updates.join(', ')} WHERE id = ?`
  updateParams.push(id)
  db.prepare(sql).run(...updateParams)

  const updatedPlan = getPlanById(id)
  if (!updatedPlan) {
    throw new Error('更新计划失败')
  }

  logAudit(
    'update_plan',
    'stocktake_plan',
    id,
    operator,
    `修改盘点计划: ${updatedPlan.name}`
  )

  return updatedPlan
}

export function startPlan(id: number, operator: string): StocktakePlan {
  const db = getDb()
  const plan = getPlanById(id)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'pending') {
    throw new Error('只有待开始状态的计划可以开始')
  }

  if (plan.executor && plan.executor !== operator && plan.created_by !== operator) {
    throw new Error('只有计划执行人或创建人可以开始计划')
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE stocktake_plan
      SET status = 'in_progress',
          started_by = ?,
          started_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(operator, id)

    const startDate = plan.plan_date
    const endDate = plan.plan_end_date || plan.plan_date

    const bookBatches = db.prepare(`
      SELECT DISTINCT batch_no FROM book_inventory
      WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
    `).all(startDate, endDate) as Array<{ batch_no: string }>

    const physicalBatches = db.prepare(`
      SELECT DISTINCT batch_no FROM physical_inventory
      WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
    `).all(startDate, endDate) as Array<{ batch_no: string }>

    const insertImportStmt = db.prepare(`
      INSERT OR IGNORE INTO stocktake_plan_import (plan_id, import_type, batch_no)
      VALUES (?, ?, ?)
    `)

    for (const { batch_no } of bookBatches) {
      insertImportStmt.run(id, 'book', batch_no)
    }
    for (const { batch_no } of physicalBatches) {
      insertImportStmt.run(id, 'physical', batch_no)
    }

    let discrepancyBatches: Array<{ id: number }>
    if (plan.scope_type === 'by_category' && plan.category) {
      discrepancyBatches = db.prepare(`
        SELECT DISTINCT db.id FROM discrepancy_batch db
        INNER JOIN discrepancy_line dl ON db.id = dl.batch_id
        WHERE date(db.created_at) >= date(?) AND date(db.created_at) <= date(?)
          AND (dl.name LIKE ? OR dl.location LIKE ?)
      `).all(startDate, endDate, `%${plan.category}%`, `%${plan.category}%`)
    } else {
      discrepancyBatches = db.prepare(`
        SELECT id FROM discrepancy_batch
        WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
      `).all(startDate, endDate) as Array<{ id: number }>
    }

    const insertDiscrepancyStmt = db.prepare(`
      INSERT OR IGNORE INTO stocktake_plan_discrepancy (plan_id, batch_id)
      VALUES (?, ?)
    `)

    for (const { id: batchId } of discrepancyBatches) {
      insertDiscrepancyStmt.run(id, batchId)
    }
  })

  tx()

  const updatedPlan = getPlanById(id)
  if (!updatedPlan) {
    throw new Error('开始计划失败')
  }

  logAudit(
    'start_plan',
    'stocktake_plan',
    id,
    operator,
    `开始盘点计划: ${plan.name}`
  )

  return updatedPlan
}

export function completePlan(id: number, operator: string): StocktakePlan {
  const db = getDb()
  const plan = getPlanById(id)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'in_progress') {
    throw new Error('只有进行中状态的计划可以完成')
  }

  if (plan.executor && plan.executor !== operator && plan.created_by !== operator) {
    throw new Error('只有计划执行人或创建人可以完成计划')
  }

  db.prepare(`
    UPDATE stocktake_plan
    SET status = 'completed',
        completed_by = ?,
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(operator, id)

  const updatedPlan = getPlanById(id)
  if (!updatedPlan) {
    throw new Error('完成计划失败')
  }

  logAudit(
    'complete_plan',
    'stocktake_plan',
    id,
    operator,
    `完成盘点计划: ${plan.name}`
  )

  return updatedPlan
}

export function cancelPlan(id: number, operator: string, reason: string): StocktakePlan {
  const db = getDb()
  const plan = getPlanById(id)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status === 'completed' || plan.status === 'cancelled') {
    throw new Error('已完成或已取消的计划不能取消')
  }

  if (plan.created_by !== operator) {
    throw new Error('只有计划创建人可以取消计划')
  }

  if (!reason) {
    throw new Error('取消原因不能为空')
  }

  db.prepare(`
    UPDATE stocktake_plan
    SET status = 'cancelled',
        cancelled_by = ?,
        cancel_reason = ?,
        cancelled_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(operator, reason, id)

  const updatedPlan = getPlanById(id)
  if (!updatedPlan) {
    throw new Error('取消计划失败')
  }

  logAudit(
    'cancel_plan',
    'stocktake_plan',
    id,
    operator,
    `取消盘点计划: ${plan.name}, 原因: ${reason}`
  )

  return updatedPlan
}

export function deletePlan(id: number, operator: string): void {
  const db = getDb()
  const plan = getPlanById(id)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'pending' && plan.status !== 'cancelled') {
    throw new Error('只有待开始或已取消状态的计划可以删除')
  }

  if (plan.created_by !== operator) {
    throw new Error('只有计划创建人可以删除计划')
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM stocktake_plan_import WHERE plan_id = ?').run(id)
    db.prepare('DELETE FROM stocktake_plan_discrepancy WHERE plan_id = ?').run(id)
    db.prepare('DELETE FROM stocktake_plan WHERE id = ?').run(id)
  })

  tx()

  logAudit(
    'delete_plan',
    'stocktake_plan',
    id,
    operator,
    `删除盘点计划: ${plan.name}`
  )
}

export function linkImportBatch(planId: number, importType: 'book' | 'physical', batchNo: string): void {
  const db = getDb()
  const plan = getPlanById(planId)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'in_progress') {
    throw new Error('只有进行中的计划可以关联导入记录')
  }

  const existing = db.prepare(`
    SELECT id FROM stocktake_plan_import
    WHERE plan_id = ? AND import_type = ? AND batch_no = ?
  `).get(planId, importType, batchNo)

  if (!existing) {
    db.prepare(`
      INSERT INTO stocktake_plan_import (plan_id, import_type, batch_no)
      VALUES (?, ?, ?)
    `).run(planId, importType, batchNo)
  }
}

export function linkDiscrepancyBatch(planId: number, batchId: number): void {
  const db = getDb()
  const plan = getPlanById(planId)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  if (plan.status !== 'in_progress') {
    throw new Error('只有进行中的计划可以关联差异批次')
  }

  const existing = db.prepare(`
    SELECT id FROM stocktake_plan_discrepancy
    WHERE plan_id = ? AND batch_id = ?
  `).get(planId, batchId)

  if (!existing) {
    db.prepare(`
      INSERT INTO stocktake_plan_discrepancy (plan_id, batch_id)
      VALUES (?, ?)
    `).run(planId, batchId)
  }
}

export function getPlanSummary(planId: number) {
  const db = getDb()
  const plan = getPlanById(planId)
  if (!plan) {
    throw new Error('盘点计划不存在')
  }

  const importCount = (db.prepare(`
    SELECT COUNT(*) as count FROM stocktake_plan_import WHERE plan_id = ?
  `).get(planId) as { count: number }).count

  const discrepancyBatches = db.prepare(`
    SELECT db.* FROM discrepancy_batch db
    INNER JOIN stocktake_plan_discrepancy spd ON db.id = spd.batch_id
    WHERE spd.plan_id = ?
  `).all(planId) as Array<{ id: number; batch_no: string; status: string }>

  const discrepancyBatchCount = discrepancyBatches.length

  const isByCategory = plan.scope_type === 'by_category' && plan.category
  const categoryFilter = isByCategory ? `%${plan.category}%` : null

  let totalDiffLines = 0
  let diffAmount = 0
  let totalDispositions = 0
  let completedDispositions = 0
  let reviewedBatches = 0
  let approvedBatches = 0

  for (const batch of discrepancyBatches) {
    let linesSql = 'SELECT id, diff_qty FROM discrepancy_line WHERE batch_id = ?'
    const params: unknown[] = [batch.id]

    if (isByCategory) {
      linesSql += ' AND (name LIKE ? OR location LIKE ?)'
      params.push(categoryFilter, categoryFilter)
    }

    const lines = db.prepare(linesSql).all(...params) as Array<{ id: number; diff_qty: number }>

    totalDiffLines += lines.length
    diffAmount += lines.reduce((sum, l) => sum + Math.abs(l.diff_qty), 0)

    let dispositionsSql = 'SELECT status FROM disposition WHERE batch_id = ?'
    const dispParams: unknown[] = [batch.id]

    if (isByCategory) {
      dispositionsSql = `
        SELECT d.status FROM disposition d
        INNER JOIN discrepancy_line dl ON d.line_id = dl.id
        WHERE d.batch_id = ? AND (dl.name LIKE ? OR dl.location LIKE ?)
      `
      dispParams.push(categoryFilter, categoryFilter)
    }

    const dispositions = db.prepare(dispositionsSql).all(...dispParams) as Array<{ status: string }>

    totalDispositions += dispositions.length
    completedDispositions += dispositions.filter(d => d.status !== 'pending').length

    if (batch.status === 'reviewed' || batch.status === 'approved') {
      reviewedBatches++
    }
    if (batch.status === 'approved') {
      approvedBatches++
    }
  }

  const dispositionProgress = totalDispositions > 0
    ? Math.round((completedDispositions / totalDispositions) * 100)
    : 0

  const approvalRate = discrepancyBatchCount > 0
    ? Math.round((approvedBatches / discrepancyBatchCount) * 100)
    : 0

  const importBatches = db.prepare(`
    SELECT * FROM stocktake_plan_import WHERE plan_id = ? ORDER BY created_at DESC
  `).all(planId)

  return {
    plan,
    importCount,
    discrepancyBatchCount,
    totalDiffLines,
    diffAmount,
    dispositionProgress,
    approvalRate,
    importBatches,
    discrepancyBatches,
  }
}

export function checkCanEdit(planId: number, operator: string): boolean {
  const plan = getPlanById(planId)
  if (!plan) return false
  return plan.created_by === operator
}

export function checkCanExecute(planId: number, operator: string): boolean {
  const plan = getPlanById(planId)
  if (!plan) return false
  if (plan.created_by === operator) return true
  if (plan.executor === operator) return true
  return false
}
