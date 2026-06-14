export interface BookInventoryItem {
  id?: number;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
  batch_no?: string;
  imported_by?: string;
  created_at?: string;
}

export interface PhysicalInventoryItem {
  id?: number;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
  operator: string;
  batch_no?: string;
  imported_by?: string;
  created_at?: string;
}

export interface DiscrepancyBatch {
  id: number;
  batch_no: string;
  status: 'pending_review' | 'reviewed' | 'approved' | 'rolled_back';
  created_by: string;
  reviewed_by: string | null;
  approved_by: string | null;
  rolled_back_by: string | null;
  rollback_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  rolled_back_at: string | null;
  line_count?: number;
}

export interface DiscrepancyLine {
  id: number;
  batch_id: number;
  sku: string;
  name: string;
  book_qty: number;
  physical_qty: number;
  diff_qty: number;
  diff_type: 'surplus' | 'shortage' | 'missed';
  unit: string;
  location: string;
  disposition?: Disposition;
}

export type DispositionStatus = 'pending' | 'accepted_loss' | 'adjusted' | 'recounted';

export interface Disposition {
  id: number;
  line_id: number;
  batch_id: number;
  status: DispositionStatus;
  remark: string;
  handler: string;
  created_at: string;
  updated_at: string;
}

export interface DispositionHistoryEntry {
  id: number;
  line_id: number;
  batch_id: number;
  from_status: DispositionStatus;
  to_status: DispositionStatus;
  remark: string;
  handler: string;
  operator: string;
  created_at: string;
}

export type UserRoleType = 'approver' | 'handler' | 'admin';

export interface UserRole {
  id: number;
  username: string;
  role: UserRoleType;
}

export interface DiscrepancyDetail {
  batch: DiscrepancyBatch;
  lines: DiscrepancyLine[];
}

export interface CurrentInventoryItem {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  operator: string;
  detail: string;
  created_at: string;
}

export interface InventoryAdjustment {
  id: number;
  batch_id: number;
  line_id: number;
  sku: string;
  name: string;
  direction: 'increase' | 'decrease';
  quantity: number;
  adjustment_type: 'original' | 'compensation';
  related_adjustment_id: number | null;
  operator: string;
  reason: string;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  warning?: string;
}

export type PlanStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type PlanScopeType = 'all' | 'by_category';
export type PlanRecurrenceType = 'once' | 'weekly' | 'monthly';

export interface StocktakePlan {
  id: number;
  plan_no: string;
  name: string;
  warehouse: string;
  scope_type: PlanScopeType;
  category?: string | null;
  plan_date: string;
  plan_end_date?: string | null;
  responsible_person: string;
  executor?: string | null;
  recurrence_type: PlanRecurrenceType;
  recurrence_value?: string | null;
  status: PlanStatus;
  created_by: string;
  started_by?: string | null;
  completed_by?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  remark?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

export interface PlanSummary {
  plan: StocktakePlan;
  importCount: number;
  discrepancyBatchCount: number;
  totalDiffLines: number;
  diffAmount: number;
  dispositionProgress: number;
  approvalRate: number;
}

export interface DashboardStats {
  diffAmountDistribution: {
    surplus: { count: number; totalAbsQty: number }
    shortage: { count: number; totalAbsQty: number }
    missed: { count: number; totalAbsQty: number }
  }
  dispositionStatusDistribution: Array<{
    status: string
    count: number
    percentage: number
  }>
  recentApprovalRate: {
    totalBatches: number
    reviewedBatches: number
    approvedBatches: number
    reviewPassRate: number
    approvalRate: number
  }
  totalBatches: number
  totalLines: number
  inventoryStats: {
    skuCount: number
    totalQuantity: number
  }
}
