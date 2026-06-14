import { getDb } from '../db.js'
import { logAudit } from './auditService.js'
import type {
  InventoryAlertRule,
  InventoryAlertResult,
  AlertType,
  AlertScopeType,
  InventoryAlertRuleDetail,
  ImportAlertRuleError,
  ImportAlertRuleResult,
} from '@shared/types'

function generateRuleNo(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `ALERT-${dateStr}-${random}`
}

function checkRuleConflict(
  alertType: AlertType,
  scopeType: AlertScopeType,
  scopeValue: string,
  excludeId?: number
): boolean {
  const db = getDb()
  let sql = `
    SELECT COUNT(*) as count FROM inventory_alert_rule
    WHERE alert_type = ?
      AND scope_type = ?
      AND scope_value = ?
      AND is_enabled = 1
  `
  const params: unknown[] = [alertType, scopeType, scopeValue]

  if (excludeId) {
    sql += ' AND id != ?'
    params.push(excludeId)
  }

  const result = db.prepare(sql).get(...params) as { count: number }
  return result.count > 0
}

function validateThresholds(
  alertType: AlertType,
  lowThreshold: number | null,
  highThreshold: number | null,
  uncountedDays: number | null
): void {
  if (alertType === 'low_stock') {
    if (lowThreshold === null || lowThreshold === undefined) {
      throw new Error('低库存预警必须设置低库存阈值')
    }
    if (lowThreshold < 0) {
      throw new Error('低库存阈值不能为负数')
    }
  } else if (alertType === 'over_stock') {
    if (highThreshold === null || highThreshold === undefined) {
      throw new Error('超库存预警必须设置高库存阈值')
    }
    if (highThreshold < 0) {
      throw new Error('超库存阈值不能为负数')
    }
    if (lowThreshold !== null && lowThreshold !== undefined && lowThreshold >= highThreshold) {
      throw new Error('低库存阈值必须小于高库存阈值')
    }
  } else if (alertType === 'long_uncounted') {
    if (uncountedDays === null || uncountedDays === undefined) {
      throw new Error('长期未盘点预警必须设置未盘点天数')
    }
    if (uncountedDays <= 0) {
      throw new Error('未盘点天数必须大于0')
    }
  }
}

export interface CreateAlertRuleParams {
  name: string
  alertType: AlertType
  scopeType: AlertScopeType
  scopeValue: string
  lowThreshold?: number | null
  highThreshold?: number | null
  uncountedDays?: number | null
  isEnabled?: boolean
  remark?: string | null
  createdBy: string
}

export function createAlertRule(params: CreateAlertRuleParams): InventoryAlertRule {
  const db = getDb()

  if (!params.name) {
    throw new Error('规则名称不能为空')
  }
  if (!params.alertType) {
    throw new Error('预警类型不能为空')
  }
  if (!params.scopeType) {
    throw new Error('范围类型不能为空')
  }
  if (!params.scopeValue) {
    throw new Error('范围值不能为空')
  }
  if (!params.createdBy) {
    throw new Error('创建人不能为空')
  }

  const lowThreshold = params.lowThreshold ?? null
  const highThreshold = params.highThreshold ?? null
  const uncountedDays = params.uncountedDays ?? null

  validateThresholds(params.alertType, lowThreshold, highThreshold, uncountedDays)

  if (params.isEnabled !== false && checkRuleConflict(params.alertType, params.scopeType, params.scopeValue)) {
    throw new Error(`同一范围(${params.scopeType}=${params.scopeValue})已存在同类型(${params.alertType})的启用规则`)
  }

  const ruleNo = generateRuleNo()
  const isEnabled = params.isEnabled !== false ? 1 : 0

  const stmt = db.prepare(`
    INSERT INTO inventory_alert_rule (
      rule_no, name, alert_type, scope_type, scope_value,
      low_threshold, high_threshold, uncounted_days, is_enabled,
      created_by, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    ruleNo,
    params.name,
    params.alertType,
    params.scopeType,
    params.scopeValue,
    lowThreshold,
    highThreshold,
    uncountedDays,
    isEnabled,
    params.createdBy,
    params.remark || null
  )

  const rule = getAlertRuleById(result.lastInsertRowid as number)
  if (!rule) {
    throw new Error('创建预警规则失败')
  }

  logAudit(
    'create_alert_rule',
    'inventory_alert_rule',
    rule.id,
    params.createdBy,
    `创建库存预警规则: ${params.name}, 类型: ${params.alertType}, 范围: ${params.scopeType}=${params.scopeValue}`
  )

  return rule
}

export function getAlertRuleById(id: number): InventoryAlertRule | null {
  const db = getDb()
  const rule = db.prepare('SELECT * FROM inventory_alert_rule WHERE id = ?').get(id) as InventoryAlertRule | undefined
  return rule || null
}

export function getAlertRuleByNo(ruleNo: string): InventoryAlertRule | null {
  const db = getDb()
  const rule = db.prepare('SELECT * FROM inventory_alert_rule WHERE rule_no = ?').get(ruleNo) as InventoryAlertRule | undefined
  return rule || null
}

export interface AlertRuleListFilters {
  alertType?: AlertType
  scopeType?: AlertScopeType
  scopeValue?: string
  isEnabled?: boolean
  createdBy?: string
  page?: number
  pageSize?: number
}

export function getAlertRuleList(filters: AlertRuleListFilters = {}): { data: InventoryAlertRule[]; total: number } {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.alertType) {
    conditions.push('alert_type = ?')
    params.push(filters.alertType)
  }
  if (filters.scopeType) {
    conditions.push('scope_type = ?')
    params.push(filters.scopeType)
  }
  if (filters.scopeValue) {
    conditions.push('scope_value LIKE ?')
    params.push(`%${filters.scopeValue}%`)
  }
  if (filters.isEnabled !== undefined) {
    conditions.push('is_enabled = ?')
    params.push(filters.isEnabled ? 1 : 0)
  }
  if (filters.createdBy) {
    conditions.push('created_by = ?')
    params.push(filters.createdBy)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const countSql = `SELECT COUNT(*) as count FROM inventory_alert_rule ${whereClause}`
  const totalResult = db.prepare(countSql).get(...params) as { count: number }

  const page = filters.page || 1
  const pageSize = filters.pageSize || 20
  const offset = (page - 1) * pageSize

  const listSql = `
    SELECT * FROM inventory_alert_rule
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `
  const data = db.prepare(listSql).all(...params, pageSize, offset) as InventoryAlertRule[]

  return { data, total: totalResult.count }
}

export interface UpdateAlertRuleParams {
  name?: string
  alertType?: AlertType
  scopeType?: AlertScopeType
  scopeValue?: string
  lowThreshold?: number | null
  highThreshold?: number | null
  uncountedDays?: number | null
  remark?: string | null
}

export function updateAlertRule(
  id: number,
  params: UpdateAlertRuleParams,
  operator: string
): InventoryAlertRule {
  const db = getDb()
  const rule = getAlertRuleById(id)
  if (!rule) {
    throw new Error('预警规则不存在')
  }

  if (rule.created_by !== operator) {
    throw new Error('只有规则创建人可以修改规则')
  }

  const updates: string[] = []
  const updateParams: unknown[] = []

  let newAlertType = rule.alert_type
  let newScopeType = rule.scope_type
  let newScopeValue = rule.scope_value
  let newLowThreshold = rule.low_threshold
  let newHighThreshold = rule.high_threshold
  let newUncountedDays = rule.uncounted_days

  if (params.name !== undefined) {
    if (!params.name) throw new Error('规则名称不能为空')
    updates.push('name = ?')
    updateParams.push(params.name)
  }
  if (params.alertType !== undefined) {
    newAlertType = params.alertType
    updates.push('alert_type = ?')
    updateParams.push(params.alertType)
  }
  if (params.scopeType !== undefined) {
    newScopeType = params.scopeType
    updates.push('scope_type = ?')
    updateParams.push(params.scopeType)
  }
  if (params.scopeValue !== undefined) {
    if (!params.scopeValue) throw new Error('范围值不能为空')
    newScopeValue = params.scopeValue
    updates.push('scope_value = ?')
    updateParams.push(params.scopeValue)
  }
  if (params.lowThreshold !== undefined) {
    newLowThreshold = params.lowThreshold
    updates.push('low_threshold = ?')
    updateParams.push(params.lowThreshold)
  }
  if (params.highThreshold !== undefined) {
    newHighThreshold = params.highThreshold
    updates.push('high_threshold = ?')
    updateParams.push(params.highThreshold)
  }
  if (params.uncountedDays !== undefined) {
    newUncountedDays = params.uncountedDays
    updates.push('uncounted_days = ?')
    updateParams.push(params.uncountedDays)
  }
  if (params.remark !== undefined) {
    updates.push('remark = ?')
    updateParams.push(params.remark || null)
  }

  if (updates.length === 0) {
    return rule
  }

  validateThresholds(newAlertType, newLowThreshold, newHighThreshold, newUncountedDays)

  if (rule.is_enabled === 1) {
    if (checkRuleConflict(newAlertType, newScopeType, newScopeValue, id)) {
      throw new Error(`同一范围(${newScopeType}=${newScopeValue})已存在同类型(${newAlertType})的启用规则`)
    }
  }

  updates.push("updated_at = datetime('now')")

  const sql = `UPDATE inventory_alert_rule SET ${updates.join(', ')} WHERE id = ?`
  updateParams.push(id)
  db.prepare(sql).run(...updateParams)

  const updatedRule = getAlertRuleById(id)
  if (!updatedRule) {
    throw new Error('更新预警规则失败')
  }

  logAudit(
    'update_alert_rule',
    'inventory_alert_rule',
    id,
    operator,
    `修改库存预警规则: ${updatedRule.name}`
  )

  return updatedRule
}

export function toggleAlertRule(id: number, operator: string): InventoryAlertRule {
  const db = getDb()
  const rule = getAlertRuleById(id)
  if (!rule) {
    throw new Error('预警规则不存在')
  }

  if (rule.created_by !== operator) {
    throw new Error('只有规则创建人可以启停规则')
  }

  const newEnabled = rule.is_enabled === 1 ? 0 : 1

  if (newEnabled === 1 && checkRuleConflict(rule.alert_type, rule.scope_type, rule.scope_value, id)) {
    throw new Error(`同一范围(${rule.scope_type}=${rule.scope_value})已存在同类型(${rule.alert_type})的启用规则`)
  }

  db.prepare(`
    UPDATE inventory_alert_rule
    SET is_enabled = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newEnabled, id)

  const updatedRule = getAlertRuleById(id)
  if (!updatedRule) {
    throw new Error('启停规则失败')
  }

  const action = newEnabled === 1 ? '启用' : '停用'
  logAudit(
    `${action === '启用' ? 'enable' : 'disable'}_alert_rule`,
    'inventory_alert_rule',
    id,
    operator,
    `${action}库存预警规则: ${rule.name}`
  )

  return updatedRule
}

export function deleteAlertRule(id: number, operator: string): void {
  const db = getDb()
  const rule = getAlertRuleById(id)
  if (!rule) {
    throw new Error('预警规则不存在')
  }

  if (rule.created_by !== operator) {
    throw new Error('只有规则创建人可以删除规则')
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM inventory_alert_result WHERE rule_id = ?').run(id)
    db.prepare('DELETE FROM inventory_alert_rule WHERE id = ?').run(id)
  })

  tx()

  logAudit(
    'delete_alert_rule',
    'inventory_alert_rule',
    id,
    operator,
    `删除库存预警规则: ${rule.name}`
  )
}

export function getAlertRuleDetail(id: number): InventoryAlertRuleDetail | null {
  const rule = getAlertRuleById(id)
  if (!rule) {
    return null
  }

  const db = getDb()
  const matchedItems = db.prepare(`
    SELECT * FROM inventory_alert_result
    WHERE rule_id = ?
    ORDER BY calculated_at DESC
    LIMIT 100
  `).all(id) as InventoryAlertResult[]

  return {
    ...rule,
    matched_items: matchedItems,
  }
}

function getInventoryForScope(scopeType: AlertScopeType, scopeValue: string) {
  const db = getDb()
  let sql = 'SELECT * FROM current_inventory'
  const params: unknown[] = []

  if (scopeType === 'sku') {
    sql += ' WHERE sku = ?'
    params.push(scopeValue)
  } else if (scopeType === 'category') {
    sql += ' WHERE name LIKE ?'
    params.push(`%${scopeValue}%`)
  } else if (scopeType === 'location') {
    sql += ' WHERE location = ?'
    params.push(scopeValue)
  }

  return db.prepare(sql).all(...params) as Array<{
    id: number
    sku: string
    name: string
    quantity: number
    unit: string
    location: string
  }>
}

export function calculateAlertRule(ruleId: number): InventoryAlertResult[] {
  const db = getDb()
  const rule = getAlertRuleById(ruleId)
  if (!rule) {
    throw new Error('预警规则不存在')
  }

  if (rule.is_enabled !== 1) {
    return []
  }

  const inventoryItems = getInventoryForScope(rule.scope_type, rule.scope_value)
  const results: InventoryAlertResult[] = []

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM inventory_alert_result WHERE rule_id = ?').run(ruleId)

    const insertStmt = db.prepare(`
      INSERT INTO inventory_alert_result (
        rule_id, inventory_id, sku, name, location, current_qty, threshold, alert_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const item of inventoryItems) {
      let triggered = false
      let threshold = 0
      let alertValue = 0

      if (rule.alert_type === 'low_stock' && rule.low_threshold !== null) {
        if (item.quantity < rule.low_threshold) {
          triggered = true
          threshold = rule.low_threshold
          alertValue = rule.low_threshold - item.quantity
        }
      } else if (rule.alert_type === 'over_stock' && rule.high_threshold !== null) {
        if (item.quantity > rule.high_threshold) {
          triggered = true
          threshold = rule.high_threshold
          alertValue = item.quantity - rule.high_threshold
        }
      } else if (rule.alert_type === 'long_uncounted' && rule.uncounted_days !== null) {
        const lastPhysical = db.prepare(`
          SELECT MAX(created_at) as last_count
          FROM physical_inventory
          WHERE sku = ?
        `).get(item.sku) as { last_count: string | null }

        if (lastPhysical.last_count) {
          const lastCountDate = new Date(lastPhysical.last_count)
          const now = new Date()
          const daysDiff = Math.floor((now.getTime() - lastCountDate.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff > rule.uncounted_days) {
            triggered = true
            threshold = rule.uncounted_days
            alertValue = daysDiff
          }
        } else {
          triggered = true
          threshold = rule.uncounted_days
          alertValue = 999
        }
      }

      if (triggered) {
        const result = insertStmt.run(
          ruleId,
          item.id,
          item.sku,
          item.name,
          item.location,
          item.quantity,
          threshold,
          alertValue
        )

        results.push({
          id: result.lastInsertRowid as number,
          rule_id: ruleId,
          inventory_id: item.id,
          sku: item.sku,
          name: item.name,
          location: item.location,
          current_qty: item.quantity,
          threshold,
          alert_value: alertValue,
          calculated_at: new Date().toISOString(),
        })
      }
    }

    db.prepare(`
      UPDATE inventory_alert_rule
      SET last_calculated_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(ruleId)
  })

  tx()

  return results
}

export function calculateAllAlertRules(): number {
  const db = getDb()
  const rules = db.prepare(`
    SELECT id FROM inventory_alert_rule WHERE is_enabled = 1
  `).all() as Array<{ id: number }>

  let totalTriggered = 0
  for (const rule of rules) {
    const results = calculateAlertRule(rule.id)
    totalTriggered += results.length
  }

  return totalTriggered
}

export interface ImportAlertRuleRow {
  name?: string
  alert_type?: string
  scope_type?: string
  scope_value?: string
  low_threshold?: string
  high_threshold?: string
  uncounted_days?: string
  is_enabled?: string
  remark?: string
}

export function importAlertRules(
  rows: ImportAlertRuleRow[],
  createdBy: string
): ImportAlertRuleResult {
  const result: ImportAlertRuleResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  }

  const validRules: Array<{
    params: CreateAlertRuleParams
    row: number
  }> = []

  const seenKeys = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2
    const row = rows[i]

    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: rowNumber, field: 'name', message: '规则名称不能为空' })
      continue
    }
    if (!row.alert_type || !['low_stock', 'over_stock', 'long_uncounted'].includes(row.alert_type.trim())) {
      result.errors.push({
        row: rowNumber,
        field: 'alert_type',
        value: row.alert_type,
        message: '预警类型必须是 low_stock、over_stock 或 long_uncounted',
      })
      continue
    }
    if (!row.scope_type || !['sku', 'category', 'location'].includes(row.scope_type.trim())) {
      result.errors.push({
        row: rowNumber,
        field: 'scope_type',
        value: row.scope_type,
        message: '范围类型必须是 sku、category 或 location',
      })
      continue
    }
    if (!row.scope_value || !row.scope_value.trim()) {
      result.errors.push({ row: rowNumber, field: 'scope_value', message: '范围值不能为空' })
      continue
    }

    const alertType = row.alert_type.trim() as AlertType
    const scopeType = row.scope_type.trim() as AlertScopeType
    const scopeValue = row.scope_value.trim()

    const lowThreshold = row.low_threshold ? parseInt(row.low_threshold.trim(), 10) : null
    const highThreshold = row.high_threshold ? parseInt(row.high_threshold.trim(), 10) : null
    const uncountedDays = row.uncounted_days ? parseInt(row.uncounted_days.trim(), 10) : null

    if (row.low_threshold !== undefined && row.low_threshold.trim() !== '' && (lowThreshold === null || isNaN(lowThreshold))) {
      result.errors.push({
        row: rowNumber,
        field: 'low_threshold',
        value: row.low_threshold,
        message: '低库存阈值必须是有效的整数',
      })
      continue
    }
    if (row.high_threshold !== undefined && row.high_threshold.trim() !== '' && (highThreshold === null || isNaN(highThreshold))) {
      result.errors.push({
        row: rowNumber,
        field: 'high_threshold',
        value: row.high_threshold,
        message: '高库存阈值必须是有效的整数',
      })
      continue
    }
    if (row.uncounted_days !== undefined && row.uncounted_days.trim() !== '' && (uncountedDays === null || isNaN(uncountedDays))) {
      result.errors.push({
        row: rowNumber,
        field: 'uncounted_days',
        value: row.uncounted_days,
        message: '未盘点天数必须是有效的整数',
      })
      continue
    }

    try {
      validateThresholds(alertType, lowThreshold, highThreshold, uncountedDays)
    } catch (err) {
      result.errors.push({
        row: rowNumber,
        message: (err as Error).message,
      })
      continue
    }

    const conflictKey = `${alertType}-${scopeType}-${scopeValue}`
    if (seenKeys.has(conflictKey)) {
      result.errors.push({
        row: rowNumber,
        message: `导入文件内存在重复规则: ${alertType} ${scopeType}=${scopeValue}`,
      })
      continue
    }
    seenKeys.add(conflictKey)

    if (checkRuleConflict(alertType, scopeType, scopeValue)) {
      result.warnings.push(`第${rowNumber}行: 系统已存在同类型启用规则，将跳过: ${row.name}`)
      result.skipped++
      continue
    }

    const existingByScope = getDb().prepare(`
      SELECT COUNT(*) as count FROM inventory_alert_rule
      WHERE alert_type = ? AND scope_type = ? AND scope_value = ?
    `).get(alertType, scopeType, scopeValue) as { count: number }

    if (existingByScope.count > 0) {
      result.warnings.push(`第${rowNumber}行: 系统已存在同类型规则(已停用)，将更新启用状态: ${row.name}`)
    }

    const isEnabled = row.is_enabled === undefined || row.is_enabled.trim() === '' || row.is_enabled.trim() === '1' || row.is_enabled.trim().toLowerCase() === 'true'

    validRules.push({
      params: {
        name: row.name.trim(),
        alertType,
        scopeType,
        scopeValue,
        lowThreshold,
        highThreshold,
        uncountedDays,
        isEnabled,
        remark: row.remark?.trim() || null,
        createdBy,
      },
      row: rowNumber,
    })
  }

  if (result.errors.length > 0) {
    return result
  }

  const db = getDb()
  const tx = db.transaction(() => {
    for (const { params } of validRules) {
      const existing = db.prepare(`
        SELECT id FROM inventory_alert_rule
        WHERE alert_type = ? AND scope_type = ? AND scope_value = ?
      `).get(params.alertType, params.scopeType, params.scopeValue) as { id: number } | undefined

      if (existing) {
        db.prepare(`
          UPDATE inventory_alert_rule
          SET name = ?, low_threshold = ?, high_threshold = ?, uncounted_days = ?,
              is_enabled = ?, remark = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          params.name,
          params.lowThreshold ?? null,
          params.highThreshold ?? null,
          params.uncountedDays ?? null,
          params.isEnabled !== false ? 1 : 0,
          params.remark || null,
          existing.id
        )
        logAudit(
          'update_alert_rule',
          'inventory_alert_rule',
          existing.id,
          createdBy,
          `导入更新库存预警规则: ${params.name}`
        )
      } else {
        createAlertRule(params)
      }
      result.imported++
    }
  })

  tx()
  result.success = true

  return result
}

export function exportAlertRules(): InventoryAlertRule[] {
  const db = getDb()
  return db.prepare('SELECT * FROM inventory_alert_rule ORDER BY created_at DESC').all() as InventoryAlertRule[]
}

export function checkCanEdit(ruleId: number, operator: string): boolean {
  const rule = getAlertRuleById(ruleId)
  if (!rule) return false
  return rule.created_by === operator
}
