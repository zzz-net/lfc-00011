import type {
  BookInventoryItem,
  PhysicalInventoryItem,
  CurrentInventoryItem,
  DiscrepancyBatch,
  DiscrepancyDetail,
  AuditLogEntry,
  InventoryAdjustment,
  ApiResponse,
} from '@shared/types'

export async function importBookInventory(
  file: File,
  importedBy: string,
): Promise<ApiResponse<{ batchNo: string; count: number }>> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('importedBy', importedBy)
  const res = await fetch('/api/inventory/book', { method: 'POST', body: formData })
  return res.json()
}

export async function importPhysicalInventory(
  file: File,
  importedBy: string,
): Promise<ApiResponse<{ batchNo: string; count: number }>> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('importedBy', importedBy)
  const res = await fetch('/api/inventory/physical', { method: 'POST', body: formData })
  return res.json()
}

export async function getBookInventory(): Promise<ApiResponse<BookInventoryItem[]>> {
  const res = await fetch('/api/inventory/book')
  return res.json()
}

export async function getPhysicalInventory(): Promise<ApiResponse<PhysicalInventoryItem[]>> {
  const res = await fetch('/api/inventory/physical')
  return res.json()
}

export async function getCurrentInventory(): Promise<ApiResponse<CurrentInventoryItem[]>> {
  const res = await fetch('/api/inventory/current')
  return res.json()
}

export async function calculateDiscrepancy(createdBy: string): Promise<ApiResponse<DiscrepancyBatch>> {
  const res = await fetch('/api/discrepancies/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ createdBy }),
  })
  return res.json()
}

export async function getDiscrepancies(): Promise<ApiResponse<{ batches: DiscrepancyBatch[]; stats: { surplus: number; shortage: number; missed: number } }>> {
  const res = await fetch('/api/discrepancies')
  return res.json()
}

export async function getDiscrepancyById(id: number): Promise<ApiResponse<DiscrepancyDetail>> {
  const res = await fetch(`/api/discrepancies/${id}`)
  return res.json()
}

export async function reviewDiscrepancy(
  id: number,
  reviewedBy: string,
  pass: boolean,
): Promise<ApiResponse<DiscrepancyBatch>> {
  const res = await fetch(`/api/discrepancies/${id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewedBy, pass }),
  })
  return res.json()
}

export async function approveDiscrepancy(
  id: number,
  approvedBy: string,
): Promise<ApiResponse<DiscrepancyBatch>> {
  const res = await fetch(`/api/discrepancies/${id}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedBy }),
  })
  return res.json()
}

export async function rollbackDiscrepancy(
  id: number,
  rolledBackBy: string,
  reason: string,
): Promise<ApiResponse<DiscrepancyBatch>> {
  const res = await fetch(`/api/discrepancies/${id}/rollback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rolledBackBy, reason }),
  })
  return res.json()
}

export async function getAuditLogs(
  page: number = 1,
  pageSize: number = 20,
): Promise<ApiResponse<{ data: AuditLogEntry[]; total: number }>> {
  const res = await fetch(`/api/audit?page=${page}&pageSize=${pageSize}`)
  return res.json()
}

export async function getAdjustments(batchId: number): Promise<ApiResponse<InventoryAdjustment[]>> {
  const res = await fetch(`/api/discrepancies/${batchId}/adjustments`)
  return res.json()
}
