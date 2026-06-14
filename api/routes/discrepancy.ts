import { Router, type Request, type Response } from 'express'
import {
  calculateDiscrepancy,
  getDiscrepancies,
  getDiscrepancyById,
  getAdjustmentsByBatch,
  reviewDiscrepancy,
  approveDiscrepancy,
  rollbackDiscrepancy,
  exportDiscrepancy,
  getDiscrepancyStats,
  getDashboardStats,
} from '../services/discrepancyService.js'

const router = Router()

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.join(',')
  const dataLines = rows.map(row =>
    headers.map(h => {
      const val = row[h] ?? ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"'
      }
      return str
    }).join(',')
  )
  return headerLine + '\n' + dataLines.join('\n')
}

router.post('/calculate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { createdBy } = req.body
    if (!createdBy) {
      res.status(400).json({ success: false, error: '缺少 createdBy 参数' })
      return
    }
    const data = calculateDiscrepancy(createdBy)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = getDiscrepancies()
    const stats = getDiscrepancyStats()
    res.json({ success: true, data: { batches: data, stats } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/dashboard/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = getDashboardStats()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getDiscrepancyById(id)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/review', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { reviewedBy, pass } = req.body
    if (!reviewedBy) {
      res.status(400).json({ success: false, error: '缺少 reviewedBy 参数' })
      return
    }
    const data = reviewDiscrepancy(id, reviewedBy, !!pass)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { approvedBy } = req.body
    if (!approvedBy) {
      res.status(400).json({ success: false, error: '缺少 approvedBy 参数' })
      return
    }
    const data = approveDiscrepancy(id, approvedBy)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/rollback', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { rolledBackBy, reason } = req.body
    if (!rolledBackBy) {
      res.status(400).json({ success: false, error: '缺少 rolledBackBy 参数' })
      return
    }
    if (!reason) {
      res.status(400).json({ success: false, error: '缺少 reason 参数' })
      return
    }
    const data = rollbackDiscrepancy(id, rolledBackBy, reason)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id/adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getAdjustmentsByBatch(id)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = exportDiscrepancy(id)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }

    const dispStatusLabels: Record<string, string> = {
      pending: '待处理',
      accepted_loss: '已认亏',
      adjusted: '已调账',
      recounted: '已复盘',
    }

    const batchHeaders = ['id', 'batch_no', 'status', 'created_by', 'reviewed_by', 'approved_by', 'rolled_back_by', 'rollback_reason', 'created_at', 'reviewed_at', 'approved_at', 'rolled_back_at']
    const lineHeaders = ['id', 'batch_id', 'sku', 'name', 'book_qty', 'physical_qty', 'diff_qty', 'diff_type', 'unit', 'location', 'disposition_status', 'disposition_handler', 'disposition_remark']
    const adjHeaders = ['id', 'batch_id', 'line_id', 'sku', 'name', 'direction', 'quantity', 'adjustment_type', 'related_adjustment_id', 'operator', 'reason', 'created_at']
    const auditHeaders = ['id', 'action', 'entity_type', 'entity_id', 'operator', 'detail', 'created_at']
    const dispHeaders = ['id', 'line_id', 'batch_id', 'status', 'remark', 'handler', 'created_at', 'updated_at']
    const dispHistoryHeaders = ['id', 'line_id', 'batch_id', 'from_status', 'to_status', 'remark', 'handler', 'operator', 'created_at']

    const dispMap = new Map(((data.dispositions || []) as unknown as Record<string, unknown>[]).map(d => [d.line_id, d]))

    const linesWithDisp = (data.lines as unknown as Record<string, unknown>[]).map(l => {
      const disp = dispMap.get(l.id) as Record<string, unknown> | undefined
      return {
        ...l,
        disposition_status: disp ? dispStatusLabels[disp.status as string] || disp.status : '待处理',
        disposition_handler: disp?.handler || '',
        disposition_remark: disp?.remark || '',
      }
    })

    const batchCsv = toCSV(batchHeaders, [data.batch as unknown as Record<string, unknown>])
    const linesCsv = toCSV(lineHeaders, linesWithDisp)
    const adjCsv = toCSV(adjHeaders, data.adjustments as unknown as Record<string, unknown>[])
    const auditCsv = toCSV(auditHeaders, data.auditLogs as unknown as Record<string, unknown>[])
    const dispCsv = toCSV(dispHeaders, (data.dispositions || []) as unknown as Record<string, unknown>[])
    const dispHistoryCsv = toCSV(dispHistoryHeaders, (data.dispositionHistory || []) as unknown as Record<string, unknown>[])

    const statusMap: Record<string, string> = {
      pending_review: '待审核',
      reviewed: '已审核',
      approved: '已批准',
      rolled_back: '已撤销',
    }

    const sections = [
      `=== 批次状态 ===`,
      `批次号: ${data.batch.batch_no}`,
      `当前状态: ${statusMap[data.batch.status] || data.batch.status}`,
      `创建人: ${data.batch.created_by}`,
      `创建时间: ${data.batch.created_at}`,
      `审核人: ${data.batch.reviewed_by || '-'}`,
      `审核时间: ${data.batch.reviewed_at || '-'}`,
      `批准人: ${data.batch.approved_by || '-'}`,
      `批准时间: ${data.batch.approved_at || '-'}`,
      `撤销人: ${data.batch.rolled_back_by || '-'}`,
      `撤销时间: ${data.batch.rolled_back_at || '-'}`,
      `撤销原因: ${data.batch.rollback_reason || '-'}`,
      `明细行数: ${data.lines.length}`,
      `调整流水数: ${data.adjustments.length}`,
      ``,
      `=== 1. 批次信息 ===`,
      batchCsv,
      ``,
      `=== 2. 差异明细（含处置状态） ===`,
      linesCsv,
      ``,
      `=== 3. 库存调整流水（原调整 + 补偿） ===`,
      adjCsv,
      ``,
      `=== 4. 处置记录 ===`,
      dispCsv,
      ``,
      `=== 5. 处置历史追溯 ===`,
      dispHistoryCsv,
      ``,
      `=== 6. 审计日志 ===`,
      auditCsv,
    ]

    const csv = sections.join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=discrepancy_${data.batch.batch_no}.csv`)
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
