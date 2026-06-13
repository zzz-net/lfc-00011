import { Router, type Request, type Response } from 'express'
import { getAuditLogs, exportAuditLogs } from '../services/auditService.js'

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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20
    const result = getAuditLogs(page, pageSize)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = exportAuditLogs()
    const headers = ['id', 'action', 'entity_type', 'entity_id', 'operator', 'detail', 'created_at']
    const csv = toCSV(headers, data as unknown as Record<string, unknown>[])

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv')
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
