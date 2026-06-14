import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import Papa from 'papaparse'
import {
  createAlertRule,
  getAlertRuleById,
  getAlertRuleList,
  updateAlertRule,
  toggleAlertRule,
  deleteAlertRule,
  getAlertRuleDetail,
  calculateAlertRule,
  calculateAllAlertRules,
  importAlertRules,
  exportAlertRules,
  checkCanEdit,
  type ImportAlertRuleRow,
} from '../services/inventoryAlertService.js'
import type { AlertType, AlertScopeType } from '@shared/types'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

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

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      alertType,
      scopeType,
      scopeValue,
      lowThreshold,
      highThreshold,
      uncountedDays,
      isEnabled,
      remark,
      createdBy,
    } = req.body

    if (!name || !alertType || !scopeType || !scopeValue || !createdBy) {
      res.status(400).json({ success: false, error: '缺少必要参数' })
      return
    }

    const data = createAlertRule({
      name,
      alertType,
      scopeType,
      scopeValue,
      lowThreshold: lowThreshold !== undefined ? lowThreshold : null,
      highThreshold: highThreshold !== undefined ? highThreshold : null,
      uncountedDays: uncountedDays !== undefined ? uncountedDays : null,
      isEnabled,
      remark,
      createdBy,
    })
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { alertType, scopeType, scopeValue, isEnabled, createdBy, page, pageSize } = req.query

    const filters = {
      alertType: alertType as AlertType | undefined,
      scopeType: scopeType as AlertScopeType | undefined,
      scopeValue: scopeValue as string | undefined,
      isEnabled: isEnabled !== undefined ? isEnabled === 'true' || isEnabled === '1' : undefined,
      createdBy: createdBy as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    }

    const data = getAlertRuleList(filters)
    res.json({ success: true, data: data.data, total: data.total })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/calculate-all', async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = calculateAllAlertRules()
    res.json({ success: true, data: { triggeredCount: count } })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post(
  '/import',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ success: false, error: '未上传文件' })
        return
      }

      const createdBy = (req.body.createdBy as string) || ''
      if (!createdBy) {
        res.status(400).json({ success: false, error: '缺少操作人参数' })
        return
      }

      const csvText = file.buffer.toString('utf-8')
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })

      if (parsed.errors.length > 0) {
        res.status(400).json({ success: false, error: 'CSV解析失败: ' + parsed.errors[0].message })
        return
      }

      const rows = parsed.data as ImportAlertRuleRow[]
      const result = importAlertRules(rows, createdBy)

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: '导入失败，请检查以下错误',
          details: result,
        })
        return
      }

      res.json({
        success: true,
        data: result,
      })
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }
)

router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = exportAlertRules()
    const headers = [
      'rule_no',
      'name',
      'alert_type',
      'scope_type',
      'scope_value',
      'low_threshold',
      'high_threshold',
      'uncounted_days',
      'is_enabled',
      'remark',
      'created_by',
      'created_at',
    ]
    const csv = toCSV(headers, data as unknown as Record<string, unknown>[])

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_alert_rules.csv')
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getAlertRuleById(id)
    if (!data) {
      res.status(404).json({ success: false, error: '预警规则不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator, ...updateParams } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    const data = updateAlertRule(id, updateParams, operator)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/toggle', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    const data = toggleAlertRule(id, operator)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    deleteAlertRule(id, operator)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id/detail', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getAlertRuleDetail(id)
    if (!data) {
      res.status(404).json({ success: false, error: '预警规则不存在' })
      return
    }
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/:id/calculate', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = calculateAlertRule(id)
    res.json({ success: true, data, count: data.length })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.post('/:id/check-permission', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    const canEdit = checkCanEdit(id, operator)

    res.json({
      success: true,
      data: {
        canEdit,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
