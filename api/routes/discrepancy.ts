import { Router, type Request, type Response } from 'express'
import {
  calculateDiscrepancy,
  getDiscrepancies,
  getDiscrepancyById,
  reviewDiscrepancy,
  approveDiscrepancy,
  rollbackDiscrepancy,
  exportDiscrepancy,
  getDiscrepancyStats,
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

router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = exportDiscrepancy(id)
    if (!data) {
      res.status(404).json({ success: false, error: '差异批次不存在' })
      return
    }

    const batchHeaders = ['id', 'batch_no', 'status', 'created_by', 'reviewed_by', 'approved_by', 'rolled_back_by', 'rollback_reason', 'created_at', 'reviewed_at', 'approved_at', 'rolled_back_at']
    const lineHeaders = ['id', 'batch_id', 'sku', 'name', 'book_qty', 'physical_qty', 'diff_qty', 'diff_type', 'unit', 'location']

    const batchCsv = toCSV(batchHeaders, [data as unknown as Record<string, unknown>])
    const linesCsv = toCSV(lineHeaders, data.lines as unknown as Record<string, unknown>[])

    const csv = batchCsv + '\n\n' + linesCsv

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=discrepancy_${data.batch_no}.csv`)
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
