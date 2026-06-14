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
  StocktakePlan,
  PlanStatus,
  PlanScopeType,
  PlanRecurrenceType,
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

export async function createPlan(params: {
  name: string
  warehouse?: string
  scopeType: PlanScopeType
  category?: string | null
  planDate: string
  planEndDate?: string | null
  responsiblePerson: string
  executor?: string | null
  recurrenceType: PlanRecurrenceType
  recurrenceValue?: string | null
  remark?: string | null
  createdBy: string
}): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch('/api/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

export async function getPlans(filters?: {
  status?: PlanStatus
  warehouse?: string
  createdBy?: string
  executor?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ data: StocktakePlan[]; total: number }>> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.warehouse) params.set('warehouse', filters.warehouse)
  if (filters?.createdBy) params.set('createdBy', filters.createdBy)
  if (filters?.executor) params.set('executor', filters.executor)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
  const res = await fetch(`/api/plans?${params.toString()}`)
  return res.json()
}

export async function getPlanById(id: number): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch(`/api/plans/${id}`)
  return res.json()
}

export async function updatePlan(
  id: number,
  params: {
    name?: string
    scopeType?: PlanScopeType
    category?: string | null
    planDate?: string
    planEndDate?: string | null
    responsiblePerson?: string
    executor?: string | null
    recurrenceType?: PlanRecurrenceType
    recurrenceValue?: string | null
    remark?: string | null
    operator: string
  }
): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch(`/api/plans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json()
}

export async function startPlan(id: number, operator: string): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch(`/api/plans/${id}/start`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator }),
  })
  return res.json()
}

export async function completePlan(id: number, operator: string): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch(`/api/plans/${id}/complete`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator }),
  })
  return res.json()
}

export async function cancelPlan(id: number, operator: string, reason: string): Promise<ApiResponse<StocktakePlan>> {
  const res = await fetch(`/api/plans/${id}/cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator, reason }),
  })
  return res.json()
}

export async function deletePlan(id: number, operator: string): Promise<ApiResponse<void>> {
  const res = await fetch(`/api/plans/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator }),
  })
  return res.json()
}

export async function getPlanSummary(id: number): Promise<ApiResponse<{
  plan: StocktakePlan
  importCount: number
  discrepancyBatchCount: number
  totalDiffLines: number
  diffAmount: number
  dispositionProgress: number
  approvalRate: number
  importBatches: Array<{ id: number; plan_id: number; import_type: string; batch_no: string; created_at: string }>
  discrepancyBatches: Array<{ id: number; batch_no: string; status: string }>
}>> {
  const res = await fetch(`/api/plans/${id}/summary`)
  return res.json()
}

export async function checkPlanPermission(
  id: number,
  operator: string
): Promise<ApiResponse<{ canEdit: boolean; canExecute: boolean }>> {
  const res = await fetch(`/api/plans/${id}/check-permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator }),
  })
  return res.json()
}

export async function linkImportToPlan(
  planId: number,
  importType: 'book' | 'physical',
  batchNo: string
): Promise<ApiResponse<void>> {
  const res = await fetch(`/api/plans/${planId}/link-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importType, batchNo }),
  })
  return res.json()
}

export async function linkDiscrepancyToPlan(
  planId: number,
  batchId: number
): Promise<ApiResponse<void>> {
  const res = await fetch(`/api/plans/${planId}/link-discrepancy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  })
  return res.json()
}
