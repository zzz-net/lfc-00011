import { Router, type Request, type Response } from 'express'
import {
  setDisposition,
  batchSetDisposition,
  getDispositions,
  getDispositionHistory,
  getDispositionHistoryByBatch,
  checkDispositionPermission,
} from '../services/dispositionService.js'

const router = Router()

router.put('/batch/action', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lineIds, batchId, status, remark, handler, operator } = req.body

    if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
      res.status(400).json({ success: false, error: '缺少 lineIds 数组' })
      return
    }
    if (!batchId || !status || !handler || !operator) {
      res.status(400).json({ success: false, error: '缺少必要参数: batchId, status, handler, operator' })
      return
    }

    const data = batchSetDisposition(lineIds, batchId, status, remark || '', handler, operator)
    res.json({ success: true, data })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('权限') || msg.includes('审批人') ? 403 : 400
    res.status(status).json({ success: false, error: msg })
  }
})

router.post('/check-permission', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operator, batchId } = req.body
    if (!operator || !batchId) {
      res.status(400).json({ success: false, error: '缺少 operator 或 batchId' })
      return
    }
    checkDispositionPermission(operator, batchId)
    res.json({ success: true, data: { allowed: true } })
  } catch (err) {
    res.json({ success: true, data: { allowed: false, reason: (err as Error).message } })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter = {
      batchId: req.query.batchId ? parseInt(req.query.batchId as string, 10) : undefined,
      status: req.query.status as string | undefined,
      sku: req.query.sku as string | undefined,
      page: parseInt(req.query.page as string, 10) || 1,
      pageSize: parseInt(req.query.pageSize as string, 10) || 50,
    }
    const data = getDispositions(filter)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/batch/:batchId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = parseInt(req.params.batchId, 10)
    const data = getDispositionHistoryByBatch(batchId)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:lineId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    const data = getDispositionHistory(lineId)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:lineId', async (req: Request, res: Response): Promise<void> => {
  try {
    const lineId = parseInt(req.params.lineId, 10)
    const { batchId, status, remark, handler, operator } = req.body

    if (!batchId || !status || !handler || !operator) {
      res.status(400).json({ success: false, error: '缺少必要参数: batchId, status, handler, operator' })
      return
    }

    const data = setDisposition(lineId, batchId, status, remark || '', handler, operator)
    res.json({ success: true, data })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('权限') || msg.includes('审批人') ? 403 : 400
    res.status(status).json({ success: false, error: msg })
  }
})

export default router
