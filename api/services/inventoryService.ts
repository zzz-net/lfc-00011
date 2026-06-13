import { getDb } from '../db.js'
import { logAudit } from './auditService.js'

export interface BookInventoryItem {
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
}

export interface PhysicalInventoryItem {
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
  operator: string
}

export interface BookInventory {
  id: number
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
  batch_no: string
  imported_by: string
  created_at: string
}

export interface PhysicalInventory {
  id: number
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
  operator: string
  batch_no: string
  imported_by: string
  created_at: string
}

export interface CurrentInventory {
  id: number
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
}

export function importBookInventory(
  items: BookInventoryItem[],
  batchNo: string,
  importedBy: string
): void {
  const db = getDb()
  const insertStmt = db.prepare(
    `INSERT INTO book_inventory (sku, name, quantity, unit, location, batch_no, imported_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const upsertCurrent = db.prepare(
    `INSERT INTO current_inventory (sku, name, quantity, unit, location) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET name=excluded.name, quantity=excluded.quantity, unit=excluded.unit, location=excluded.location`
  )

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM book_inventory').run()
    for (const item of items) {
      const info = insertStmt.run(
        item.sku, item.name, item.quantity, item.unit, item.location, batchNo, importedBy
      )
      upsertCurrent.run(item.sku, item.name, item.quantity, item.unit, item.location)
      logAudit('import_book_inventory', 'book_inventory', info.lastInsertRowid as number, importedBy, `batch=${batchNo}, sku=${item.sku}, qty=${item.quantity}`)
    }
  })

  transaction()
}

export function importPhysicalInventory(
  items: PhysicalInventoryItem[],
  batchNo: string,
  importedBy: string
): void {
  for (const item of items) {
    if (item.quantity < 0) {
      throw new Error(`实物盘点数量不能为负数: SKU=${item.sku}, 数量=${item.quantity}`)
    }
  }

  const db = getDb()
  const insertStmt = db.prepare(
    `INSERT INTO physical_inventory (sku, name, quantity, unit, location, operator, batch_no, imported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM physical_inventory').run()
    for (const item of items) {
      const info = insertStmt.run(
        item.sku, item.name, item.quantity, item.unit, item.location, item.operator, batchNo, importedBy
      )
      logAudit('import_physical_inventory', 'physical_inventory', info.lastInsertRowid as number, importedBy, `batch=${batchNo}, sku=${item.sku}, qty=${item.quantity}`)
    }
  })

  transaction()
}

export function getBookInventory(): BookInventory[] {
  const db = getDb()
  return db.prepare('SELECT * FROM book_inventory ORDER BY created_at DESC').all() as BookInventory[]
}

export function getPhysicalInventory(): PhysicalInventory[] {
  const db = getDb()
  return db.prepare('SELECT * FROM physical_inventory ORDER BY created_at DESC').all() as PhysicalInventory[]
}

export function getCurrentInventory(): CurrentInventory[] {
  const db = getDb()
  return db.prepare('SELECT * FROM current_inventory ORDER BY sku').all() as CurrentInventory[]
}

export function exportCurrentInventory(): CurrentInventory[] {
  const db = getDb()
  return db.prepare('SELECT * FROM current_inventory ORDER BY sku').all() as CurrentInventory[]
}
