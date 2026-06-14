import { Router, type Request, type Response } from 'express'
import {
  createPlan,
  getPlanById,
  getPlanList,
  updatePlan,
  startPlan,
  completePlan,
  cancelPlan,
  deletePlan,
  getPlanSummary,
  checkCanEdit,
  checkCanExecute,
  linkImportBatch,
  linkDiscrepancyBatch,
} from '../services/planService.js'
import type { PlanStatus } from '@shared/types'

const router = Router()

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      warehouse,
      scopeType,
      category,
      planDate,
      planEndDate,
      responsiblePerson,
      executor,
      recurrenceType,
      recurrenceValue,
      remark,
      createdBy,
    } = req.body

    if (!name || !planDate || !responsiblePerson || !createdBy) {
      res.status(400).json({ success: false, error: '缺少必要参数' })
      return
    }

    const data = createPlan({
      name,
      warehouse,
      scopeType,
      category,
      planDate,
      planEndDate,
      responsiblePerson,
      executor,
      recurrenceType,
      recurrenceValue,
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
    const { status, warehouse, createdBy, executor, page, pageSize } = req.query

    const filters = {
      status: status as PlanStatus | undefined,
      warehouse: warehouse as string | undefined,
      createdBy: createdBy as string | undefined,
      executor: executor as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    }

    const data = getPlanList(filters)
    res.json({ success: true, data: data.data, total: data.total })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getPlanById(id)
    if (!data) {
      res.status(404).json({ success: false, error: '盘点计划不存在' })
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

    const data = updatePlan(id, updateParams, operator)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    const data = startPlan(id, operator)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator } = req.body

    if (!operator) {
      res.status(400).json({ success: false, error: '缺少操作人参数' })
      return
    }

    const data = completePlan(id, operator)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.put('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const { operator, reason } = req.body

    if (!operator || !reason) {
      res.status(400).json({ success: false, error: '缺少操作人或取消原因' })
      return
    }

    const data = cancelPlan(id, operator, reason)
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

    deletePlan(id, operator)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.get('/:id/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = getPlanSummary(id)
    res.json({ success: true, data })
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
    const canExecute = checkCanExecute(id, operator)

    res.json({
      success: true,
      data: {
        canEdit,
        canExecute,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.post('/:id/link-import', async (req: Request, res: Response): Promise<void> => {
  try {
    const planId = parseInt(req.params.id, 10)
    const { importType, batchNo } = req.body

    if (!importType || !batchNo) {
      res.status(400).json({ success: false, error: '缺少必要参数' })
      return
    }

    linkImportBatch(planId, importType as 'book' | 'physical', batchNo)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.post('/:id/link-discrepancy', async (req: Request, res: Response): Promise<void> => {
  try {
    const planId = parseInt(req.params.id, 10)
    const { batchId } = req.body

    if (!batchId) {
      res.status(400).json({ success: false, error: '缺少批次ID参数' })
      return
    }

    linkDiscrepancyBatch(planId, batchId)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

export default router
