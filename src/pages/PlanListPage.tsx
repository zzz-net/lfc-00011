import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Plus, RefreshCw, Play, Square, XCircle, Trash2, Edit, Filter } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getPlans, startPlan, completePlan, cancelPlan, deletePlan } from '@/api/client'
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

export default function PlanListPage() {
  const { operator, addToast } = useAppStore()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<StocktakePlan[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<PlanStatus | ''>('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelPlanId, setCancelPlanId] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => { loadPlans() }, [statusFilter])

  async function loadPlans() {
    setLoading(true)
    try {
      const res = await getPlans({
        status: statusFilter || undefined,
        pageSize: 50,
      })
      if (res.success && res.data) {
        setPlans(res.data.data)
        setTotal(res.data.total)
      } else {
        addToast('error', res.error || '加载失败')
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart(plan: StocktakePlan) {
    if (!operator) { addToast('error', '请输入操作人'); return }
    try {
      const res = await startPlan(plan.id, operator)
      if (res.success) {
        addToast('success', '计划已开始')
        loadPlans()
      } else {
        addToast('error', res.error || '开始失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleComplete(plan: StocktakePlan) {
    if (!operator) { addToast('error', '请输入操作人'); return }
    try {
      const res = await completePlan(plan.id, operator)
      if (res.success) {
        addToast('success', '计划已完成')
        loadPlans()
      } else {
        addToast('error', res.error || '完成失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  function openCancelModal(id: number) {
    setCancelPlanId(id)
    setCancelReason('')
    setShowCancelModal(true)
  }

  async function handleCancel() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (!cancelReason) { addToast('error', '请输入取消原因'); return }
    if (!cancelPlanId) return

    try {
      const res = await cancelPlan(cancelPlanId, operator, cancelReason)
      if (res.success) {
        addToast('success', '计划已取消')
        setShowCancelModal(false)
        setCancelPlanId(null)
        loadPlans()
      } else {
        addToast('error', res.error || '取消失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleDelete(plan: StocktakePlan) {
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (!confirm(`确定要删除计划"${plan.name}"吗？`)) return

    try {
      const res = await deletePlan(plan.id, operator)
      if (res.success) {
        addToast('success', '计划已删除')
        loadPlans()
      } else {
        addToast('error', res.error || '删除失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  function canEdit(plan: StocktakePlan): boolean {
    return plan.created_by === operator
  }

  function canExecute(plan: StocktakePlan): boolean {
    return plan.created_by === operator || plan.executor === operator
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">盘点计划</h1>
        <button
          onClick={() => navigate('/plans/new')}
          disabled={!operator}
          className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建计划
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PlanStatus | '')}
            className="border border-slate-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">全部状态</option>
            <option value="pending">待开始</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        <button
          onClick={loadPlans}
          disabled={loading}
          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <span className="text-sm text-slate-500 ml-auto">共 {total} 条计划</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left py-3 px-4">计划编号</th>
              <th className="text-left py-3 px-4">计划名称</th>
              <th className="text-left py-3 px-4">盘点范围</th>
              <th className="text-left py-3 px-4">计划日期</th>
              <th className="text-left py-3 px-4">负责人</th>
              <th className="text-left py-3 px-4">执行人</th>
              <th className="text-left py-3 px-4">重复类型</th>
              <th className="text-left py-3 px-4">状态</th>
              <th className="text-left py-3 px-4">创建人</th>
              <th className="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr><td colSpan={10} className="py-12 text-center text-slate-400">暂无盘点计划</td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{plan.plan_no}</td>
                <td className="py-2.5 px-4 font-medium text-slate-800">
                  <Link to={`/plans/${plan.id}`} className="text-amber-600 hover:text-amber-700">
                    {plan.name}
                  </Link>
                </td>
                <td className="py-2.5 px-4">
                  {scopeLabels[plan.scope_type] || plan.scope_type}
                  {plan.scope_type === 'by_category' && plan.category && (
                    <span className="text-slate-500">（{plan.category}）</span>
                  )}
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1 text-slate-600">
                    <Calendar className="w-3.5 h-3.5" />
                    {plan.plan_date}
                    {plan.plan_end_date && ` ~ ${plan.plan_end_date}`}
                  </div>
                </td>
                <td className="py-2.5 px-4">{plan.responsible_person}</td>
                <td className="py-2.5 px-4">{plan.executor || '-'}</td>
                <td className="py-2.5 px-4">{recurrenceLabels[plan.recurrence_type] || plan.recurrence_type}</td>
                <td className="py-2.5 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[plan.status]}`}>
                    {statusLabels[plan.status]}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-500">{plan.created_by}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Link to={`/plans/${plan.id}`} className="text-slate-600 hover:text-slate-800" title="查看详情">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Link>

                    {plan.status === 'pending' && canEdit(plan) && (
                      <button onClick={() => navigate(`/plans/${plan.id}/edit`)} className="text-slate-600 hover:text-amber-600" title="编辑">
                        <Edit className="w-4 h-4" />
                      </button>
                    )}

                    {plan.status === 'pending' && canExecute(plan) && (
                      <button onClick={() => handleStart(plan)} className="text-blue-600 hover:text-blue-700" title="开始">
                        <Play className="w-4 h-4" />
                      </button>
                    )}

                    {plan.status === 'in_progress' && canExecute(plan) && (
                      <button onClick={() => handleComplete(plan)} className="text-green-600 hover:text-green-700" title="完成">
                        <Square className="w-4 h-4" />
                      </button>
                    )}

                    {(plan.status === 'pending' || plan.status === 'in_progress') && canEdit(plan) && (
                      <button onClick={() => openCancelModal(plan.id)} className="text-orange-600 hover:text-orange-700" title="取消">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}

                    {(plan.status === 'pending' || plan.status === 'cancelled') && canEdit(plan) && (
                      <button onClick={() => handleDelete(plan)} className="text-red-600 hover:text-red-700" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
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
