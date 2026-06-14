import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import Papa from 'papaparse'
import {
  importBookInventory,
  importPhysicalInventory,
  getBookInventory,
  getPhysicalInventory,
  getCurrentInventory,
  exportCurrentInventory,
} from '../services/inventoryService.js'

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

router.post(
  '/book',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ success: false, error: '未上传文件' })
        return
      }

      const csvText = file.buffer.toString('utf-8')
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })

      if (parsed.errors.length > 0) {
        res.status(400).json({ success: false, error: 'CSV解析失败: ' + parsed.errors[0].message })
        return
      }

      const items = parsed.data as Array<{ sku: string; name: string; quantity: string; unit: string; location: string }>

      const validItems: Array<{ sku: string; name: string; quantity: number; unit: string; location: string }> = []
      const skippedEmptySkuRows: number[] = []
      const invalidQuantityRows: Array<{ row: number; value: string }> = []

      items.forEach((item, idx) => {
        const rowNumber = idx + 2 // 1-based, header is row 1
        const sku = (item.sku ?? '').trim()

        if (!sku) {
          skippedEmptySkuRows.push(rowNumber)
          return
        }

        const qtyStr = (item.quantity ?? '').trim()
        if (qtyStr === '' || isNaN(Number(qtyStr)) || !Number.isInteger(Number(qtyStr))) {
          invalidQuantityRows.push({ row: rowNumber, value: qtyStr })
          return
        }
        const qty = parseInt(qtyStr, 10)
        if (qty < 0) {
          invalidQuantityRows.push({ row: rowNumber, value: qtyStr })
          return
        }

        validItems.push({
          sku,
          name: (item.name ?? '').trim(),
          quantity: qty,
          unit: (item.unit ?? '').trim(),
          location: (item.location ?? '').trim(),
        })
      })

      if (invalidQuantityRows.length > 0) {
        const details = invalidQuantityRows.map(r => `第${r.row}行(value="${r.value}")`).join(', ')
        res.status(400).json({
          success: false,
          error: `数量字段存在非法值: ${details}。请填写非负整数。`,
          details: { invalidQuantityRows, skippedEmptySkuCount: skippedEmptySkuRows.length, skippedEmptySkuRows }
        })
        return
      }

      const importedBy = (req.body.importedBy as string) || ''
      const batchNo = 'BOOK-' + Date.now()

      importBookInventory(validItems, batchNo, importedBy)
      res.json({
        success: true,
        data: {
          batchNo,
          count: validItems.length,
          skippedEmptySkuCount: skippedEmptySkuRows.length,
          skippedEmptySkuRows,
          warning: skippedEmptySkuRows.length > 0 ? `已跳过 ${skippedEmptySkuRows.length} 行货品编码为空的记录` : undefined
        }
      })
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message })
    }
  }
)

router.post(
  '/physical',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ success: false, error: '未上传文件' })
        return
      }

      const csvText = file.buffer.toString('utf-8')
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })

      if (parsed.errors.length > 0) {
        res.status(400).json({ success: false, error: 'CSV解析失败: ' + parsed.errors[0].message })
        return
      }

      const items = parsed.data as Array<{ sku: string; name: string; quantity: string; unit: string; location: string; operator: string }>

      const validItems: Array<{ sku: string; name: string; quantity: number; unit: string; location: string; operator: string }> = []
      const skippedEmptySkuRows: number[] = []
      const invalidQuantityRows: Array<{ row: number; value: string }> = []

      items.forEach((item, idx) => {
        const rowNumber = idx + 2 // 1-based, header is row 1
        const sku = (item.sku ?? '').trim()

        if (!sku) {
          skippedEmptySkuRows.push(rowNumber)
          return
        }

        const qtyStr = (item.quantity ?? '').trim()
        if (qtyStr === '' || isNaN(Number(qtyStr)) || !Number.isInteger(Number(qtyStr))) {
          invalidQuantityRows.push({ row: rowNumber, value: qtyStr })
          return
        }
        const qty = parseInt(qtyStr, 10)
        if (qty < 0) {
          invalidQuantityRows.push({ row: rowNumber, value: qtyStr })
          return
        }

        validItems.push({
          sku,
          name: (item.name ?? '').trim(),
          quantity: qty,
          unit: (item.unit ?? '').trim(),
          location: (item.location ?? '').trim(),
          operator: (item.operator ?? '').trim(),
        })
      })

      if (invalidQuantityRows.length > 0) {
        const details = invalidQuantityRows.map(r => `第${r.row}行(value="${r.value}")`).join(', ')
        res.status(400).json({
          success: false,
          error: `数量字段存在非法值: ${details}。请填写非负整数。`,
          details: { invalidQuantityRows, skippedEmptySkuCount: skippedEmptySkuRows.length, skippedEmptySkuRows }
        })
        return
      }

      const importedBy = (req.body.importedBy as string) || ''
      const batchNo = 'PHYSICAL-' + Date.now()

      importPhysicalInventory(validItems, batchNo, importedBy)
      res.json({
        success: true,
        data: {
          batchNo,
          count: validItems.length,
          skippedEmptySkuCount: skippedEmptySkuRows.length,
          skippedEmptySkuRows,
          warning: skippedEmptySkuRows.length > 0 ? `已跳过 ${skippedEmptySkuRows.length} 行货品编码为空的记录` : undefined
        }
      })
    } catch (err) {
      res.status(400).json({ success: false, error: (err as Error).message })
    }
  }
)

router.get('/book', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = getBookInventory()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/physical', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = getPhysicalInventory()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/current', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = getCurrentInventory()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = exportCurrentInventory()
    const headers = ['id', 'sku', 'name', 'quantity', 'unit', 'location']
    const csv = toCSV(headers, data as unknown as Record<string, unknown>[])

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=current_inventory.csv')
    res.send('\uFEFF' + csv)
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

export default router
