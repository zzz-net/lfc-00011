import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { createPlan, getPlanById, updatePlan } from '@/api/client'
import type { PlanScopeType, PlanRecurrenceType } from '@shared/types'

export default function PlanFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { operator, addToast } = useAppStore()
  const isEdit = !!id

  const [formData, setFormData] = useState({
    name: '',
    warehouse: 'default',
    scopeType: 'all' as PlanScopeType,
    category: '',
    planDate: '',
    planEndDate: '',
    responsiblePerson: '',
    executor: '',
    recurrenceType: 'once' as PlanRecurrenceType,
    recurrenceValue: '',
    remark: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit && id) {
      loadPlan(parseInt(id, 10))
    }
  }, [id, isEdit])

  async function loadPlan(planId: number) {
    setLoading(true)
    try {
      const res = await getPlanById(planId)
      if (res.success && res.data) {
        const plan = res.data
        setFormData({
          name: plan.name,
          warehouse: plan.warehouse,
          scopeType: plan.scope_type,
          category: plan.category || '',
          planDate: plan.plan_date,
          planEndDate: plan.plan_end_date || '',
          responsiblePerson: plan.responsible_person,
          executor: plan.executor || '',
          recurrenceType: plan.recurrence_type,
          recurrenceValue: plan.recurrence_value || '',
          remark: plan.remark || '',
        })
      } else {
        addToast('error', res.error || '加载失败')
        navigate('/plans')
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (!formData.name) { addToast('error', '请输入计划名称'); return }
    if (!formData.planDate) { addToast('error', '请选择计划日期'); return }
    if (!formData.responsiblePerson) { addToast('error', '请输入负责人'); return }
    if (formData.scopeType === 'by_category' && !formData.category) {
      addToast('error', '按类别盘点时必须指定类别'); return
    }

    setSaving(true)
    try {
      if (isEdit && id) {
        const res = await updatePlan(parseInt(id, 10), {
          ...formData,
          category: formData.scopeType === 'by_category' ? formData.category : null,
          planEndDate: formData.planEndDate || null,
          executor: formData.executor || null,
          recurrenceValue: formData.recurrenceValue || null,
          remark: formData.remark || null,
          operator,
        })
        if (res.success) {
          addToast('success', '计划更新成功')
          navigate(`/plans/${id}`)
        } else {
          addToast('error', res.error || '更新失败')
        }
      } else {
        const res = await createPlan({
          ...formData,
          category: formData.scopeType === 'by_category' ? formData.category : null,
          planEndDate: formData.planEndDate || null,
          executor: formData.executor || null,
          recurrenceValue: formData.recurrenceValue || null,
          remark: formData.remark || null,
          createdBy: operator,
        })
        if (res.success) {
          addToast('success', '计划创建成功')
          navigate('/plans')
        } else {
          addToast('error', res.error || '创建失败')
        }
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-500">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/plans" className="text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">
          {isEdit ? '编辑盘点计划' : '新建盘点计划'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              计划名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="请输入计划名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">仓库</label>
            <input
              type="text"
              value={formData.warehouse}
              onChange={(e) => handleChange('warehouse', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="default"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            盘点范围 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scopeType"
                value="all"
                checked={formData.scopeType === 'all'}
                onChange={(e) => handleChange('scopeType', e.target.value as PlanScopeType)}
                className="text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">全仓盘点</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scopeType"
                value="by_category"
                checked={formData.scopeType === 'by_category'}
                onChange={(e) => handleChange('scopeType', e.target.value as PlanScopeType)}
                className="text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">按货品类别</span>
            </label>
          </div>
        </div>

        {formData.scopeType === 'by_category' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              货品类别 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="请输入货品类别"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              计划日期 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.planDate}
              onChange={(e) => handleChange('planDate', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">结束日期（可选）</label>
            <input
              type="date"
              value={formData.planEndDate}
              onChange={(e) => handleChange('planEndDate', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              负责人 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.responsiblePerson}
              onChange={(e) => handleChange('responsiblePerson', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="请输入负责人姓名"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">执行人</label>
            <input
              type="text"
              value={formData.executor}
              onChange={(e) => handleChange('executor', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="请输入执行人姓名"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">重复类型</label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recurrenceType"
                value="once"
                checked={formData.recurrenceType === 'once'}
                onChange={(e) => handleChange('recurrenceType', e.target.value as PlanRecurrenceType)}
                className="text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">一次性</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recurrenceType"
                value="weekly"
                checked={formData.recurrenceType === 'weekly'}
                onChange={(e) => handleChange('recurrenceType', e.target.value as PlanRecurrenceType)}
                className="text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">每周</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recurrenceType"
                value="monthly"
                checked={formData.recurrenceType === 'monthly'}
                onChange={(e) => handleChange('recurrenceType', e.target.value as PlanRecurrenceType)}
                className="text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">每月</span>
            </label>
          </div>
        </div>

        {formData.recurrenceType !== 'once' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {formData.recurrenceType === 'weekly' ? '周几' : '每月第几天'}
            </label>
            <input
              type="text"
              value={formData.recurrenceValue}
              onChange={(e) => handleChange('recurrenceValue', e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder={formData.recurrenceType === 'weekly' ? '周一、周三' : '1号、15号'}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">备注</label>
          <textarea
            value={formData.remark}
            onChange={(e) => handleChange('remark', e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            rows={3}
            placeholder="请输入备注信息"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => navigate('/plans')}
            className="px-5 py-2.5 text-sm border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving || !operator}
            className="px-5 py-2.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
