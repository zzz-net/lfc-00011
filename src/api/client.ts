import type {
  BookInventoryItem,
  PhysicalInventoryItem,
  CurrentInventoryItem,
  DiscrepancyBatch,
  DiscrepancyDetail,
  AuditLogEntry,
  InventoryAdjustment,
  Disposition,
  DispositionHistoryEntry,
  UserRole,
  UserRoleType,
  ApiResponse,
  DashboardStats,
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

export async function setDisposition(
  lineId: number,
  batchId: number,
  status: string,
  remark: string,
  handler: string,
  operator: string,
): Promise<ApiResponse<Disposition>> {
  const res = await fetch(`/api/dispositions/${lineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, status, remark, handler, operator }),
  })
  return res.json()
}

export async function batchSetDisposition(
  lineIds: number[],
  batchId: number,
  status: string,
  remark: string,
  handler: string,
  operator: string,
): Promise<ApiResponse<Disposition[]>> {
  const res = await fetch('/api/dispositions/batch/action', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lineIds, batchId, status, remark, handler, operator }),
  })
  return res.json()
}

export async function getDispositions(
  batchId: number,
  filters?: { status?: string; sku?: string; page?: number; pageSize?: number },
): Promise<ApiResponse<{ data: (Disposition & { sku: string; name: string; diff_type: string })[]; total: number }>> {
  const params = new URLSearchParams()
  params.set('batchId', String(batchId))
  if (filters?.status) params.set('status', filters.status)
  if (filters?.sku) params.set('sku', filters.sku)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
  const res = await fetch(`/api/dispositions?${params}`)
  return res.json()
}

export async function getDispositionHistory(
  lineId: number,
): Promise<ApiResponse<DispositionHistoryEntry[]>> {
  const res = await fetch(`/api/dispositions/${lineId}/history`)
  return res.json()
}

export async function getDispositionHistoryByBatch(
  batchId: number,
): Promise<ApiResponse<DispositionHistoryEntry[]>> {
  const res = await fetch(`/api/dispositions/batch/${batchId}/history`)
  return res.json()
}

export async function checkDispositionPermission(
  operator: string,
  batchId: number,
): Promise<ApiResponse<{ allowed: boolean; reason?: string }>> {
  const res = await fetch('/api/dispositions/check-permission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator, batchId }),
  })
  return res.json()
}

export async function getUserRole(
  username: string,
): Promise<ApiResponse<UserRole | null>> {
  const res = await fetch(`/api/auth/role?username=${encodeURIComponent(username)}`)
  return res.json()
}

export async function setUserRole(
  username: string,
  role: UserRoleType,
): Promise<ApiResponse<UserRole>> {
  const res = await fetch('/api/auth/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, role }),
  })
  return res.json()
}

export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const res = await fetch('/api/discrepancies/dashboard/stats')
  return res.json()
}
