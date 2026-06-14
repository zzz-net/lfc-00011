import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, XCircle, Edit,
  TrendingUp, TrendingDown, AlertTriangle,
  FileText, ClipboardList, CheckCircle,
  Percent, DollarSign
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import {
  getPlanById,
  getPlanSummary,
  startPlan,
  completePlan,
  cancelPlan,
  deletePlan,
  checkPlanPermission,
} from '@/api/client'
import type { StocktakePlan, PlanStatus } from '@shared/types'

const statusStyles: Record<PlanStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const statusLabels: Record<PlanStatus, string> = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const scopeLabels: Record<string, string> = {
  all: '全仓盘点',
  by_category: '按类别盘点',
}

const recurrenceLabels: Record<string, string> = {
  once: '一次性',
  weekly: '每周',
  monthly: '每月',
}

const batchStatusLabels: Record<string, string> = {
  pending_review: '待复核',
  reviewed: '已复核',
  approved: '已批准',
  rolled_back: '已回滚',
}

export default function PlanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { operator, addToast } = useAppStore()

  const [plan, setPlan] = useState<StocktakePlan | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState({ canEdit: false, canExecute: false })
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    if (id) {
      loadData(parseInt(id, 10))
    }
  }, [id])

  async function loadData(planId: number) {
    setLoading(true)
    try {
      const [planRes, summaryRes, permRes] = await Promise.all([
        getPlanById(planId),
        getPlanSummary(planId),
        operator ? checkPlanPermission(planId, operator) : Promise.resolve({ success: true, data: { canEdit: false, canExecute: false } }),
      ])

      if (planRes.success && planRes.data) {
        setPlan(planRes.data)
      } else {
        addToast('error', planRes.error || '加载失败')
        navigate('/plans')
        return
      }

      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data)
      }

      if (permRes.success && permRes.data) {
        setPermissions(permRes.data)
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    if (!operator || !id) return
    try {
      const res = await startPlan(parseInt(id, 10), operator)
      if (res.success) {
        addToast('success', '计划已开始')
        loadData(parseInt(id, 10))
      } else {
        addToast('error', res.error || '开始失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleComplete() {
    if (!operator || !id) return
    try {
      const res = await completePlan(parseInt(id, 10), operator)
      if (res.success) {
        addToast('success', '计划已完成')
        loadData(parseInt(id, 10))
      } else {
        addToast('error', res.error || '完成失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleCancel() {
    if (!operator || !id || !cancelReason) return
    try {
      const res = await cancelPlan(parseInt(id, 10), operator, cancelReason)
      if (res.success) {
        addToast('success', '计划已取消')
        setShowCancelModal(false)
        loadData(parseInt(id, 10))
      } else {
        addToast('error', res.error || '取消失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleDelete() {
    if (!operator || !id || !plan) return
    if (!confirm(`确定要删除计划"${plan.name}"吗？`)) return
    try {
      const res = await deletePlan(parseInt(id, 10), operator)
      if (res.success) {
        addToast('success', '计划已删除')
        navigate('/plans')
      } else {
        addToast('error', res.error || '删除失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-500">加载中...</div>
  }

  if (!plan) {
    return <div className="text-center py-12 text-slate-500">计划不存在</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/plans" className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{plan.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500 font-mono">{plan.plan_no}</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[plan.status]}`}>
                {statusLabels[plan.status]}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {plan.status === 'pending' && permissions.canEdit && (
            <button
              onClick={() => navigate(`/plans/${plan.id}/edit`)}
              className="px-4 py-2 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              编辑
            </button>
          )}

          {plan.status === 'pending' && permissions.canExecute && (
            <button
              onClick={handleStart}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              开始盘点
            </button>
          )}

          {plan.status === 'in_progress' && permissions.canExecute && (
            <button
              onClick={handleComplete}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              完成盘点
            </button>
          )}

          {(plan.status === 'pending' || plan.status === 'in_progress') && permissions.canEdit && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 text-sm border border-orange-300 text-orange-600 rounded hover:bg-orange-50 flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              取消计划
            </button>
          )}

          {(plan.status === 'pending' || plan.status === 'cancelled') && permissions.canEdit && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              删除
            </button>
          )}
        </div>
      </div>

      {/* 基本信息 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">基本信息</h2>
        <div className="grid grid-cols-4 gap-6 text-sm">
          <div>
            <p className="text-slate-500 mb-1">盘点范围</p>
            <p className="text-slate-800 font-medium">
              {scopeLabels[plan.scope_type] || plan.scope_type}
              {plan.scope_type === 'by_category' && plan.category && (
                <span className="text-slate-500 ml-2">（{plan.category}）</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">计划日期</p>
            <p className="text-slate-800 font-medium">
              {plan.plan_date}
              {plan.plan_end_date && ` ~ ${plan.plan_end_date}`}
            </p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">负责人</p>
            <p className="text-slate-800 font-medium">{plan.responsible_person}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">执行人</p>
            <p className="text-slate-800 font-medium">{plan.executor || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">重复类型</p>
            <p className="text-slate-800 font-medium">
              {recurrenceLabels[plan.recurrence_type] || plan.recurrence_type}
              {plan.recurrence_value && `（${plan.recurrence_value}）`}
            </p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">仓库</p>
            <p className="text-slate-800 font-medium">{plan.warehouse}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">创建人</p>
            <p className="text-slate-800 font-medium">{plan.created_by}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">创建时间</p>
            <p className="text-slate-800 font-medium">{plan.created_at}</p>
          </div>
        </div>
        {plan.remark && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-slate-500 mb-1 text-sm">备注</p>
            <p className="text-slate-700 text-sm">{plan.remark}</p>
          </div>
        )}
        {plan.cancel_reason && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-orange-500 mb-1 text-sm font-medium">取消原因</p>
            <p className="text-slate-700 text-sm">{plan.cancel_reason}</p>
          </div>
        )}
      </div>

      {/* 汇总统计 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">导入批次</p>
              <p className="text-xl font-bold text-slate-800">{summary?.importCount || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">差异批次</p>
              <p className="text-xl font-bold text-slate-800">{summary?.discrepancyBatchCount || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">差异数量</p>
              <p className="text-xl font-bold text-slate-800">{summary?.totalDiffLines || 0} 条</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">差异总数量</p>
              <p className="text-xl font-bold text-slate-800">{summary?.diffAmount || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-slate-700">处置进度</span>
            </div>
            <span className="text-lg font-bold text-slate-800">{summary?.dispositionProgress || 0}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${summary?.dispositionProgress || 0}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">审批通过率</span>
            </div>
            <span className="text-lg font-bold text-slate-800">{summary?.approvalRate || 0}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${summary?.approvalRate || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 关联的导入记录 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">关联导入记录</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="text-left py-3 px-4">类型</th>
                <th className="text-left py-3 px-4">批次号</th>
                <th className="text-left py-3 px-4">关联时间</th>
              </tr>
            </thead>
            <tbody>
              {!summary?.importBatches?.length ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-400">暂无导入记录</td></tr>
              ) : summary.importBatches.map((imp: any) => (
                <tr key={imp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      imp.import_type === 'book' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {imp.import_type === 'book' ? '账面库存' : '实物盘点'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs">{imp.batch_no}</td>
                  <td className="py-2.5 px-4 text-slate-500">{imp.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 关联的差异批次 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">关联差异批次</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="text-left py-3 px-4">批次号</th>
                <th className="text-left py-3 px-4">状态</th>
                <th className="text-left py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {!summary?.discrepancyBatches?.length ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-400">暂无差异批次</td></tr>
              ) : summary.discrepancyBatches.map((batch: any) => (
                <tr key={batch.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-xs">{batch.batch_no}</td>
                  <td className="py-2.5 px-4">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {batchStatusLabels[batch.status] || batch.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Link to={`/discrepancy/${batch.id}`} className="text-amber-600 hover:text-amber-700 font-medium">
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 取消计划弹窗 */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-4">取消盘点计划</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">取消原因</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                rows={3}
                placeholder="请输入取消原因"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleCancel}
                disabled={!cancelReason}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
