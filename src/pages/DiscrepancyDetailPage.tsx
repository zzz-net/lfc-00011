import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FileDown, ArrowLeft } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getDiscrepancyById, reviewDiscrepancy, approveDiscrepancy, rollbackDiscrepancy } from '@/api/client'
import type { DiscrepancyDetail } from '@shared/types'

const statusStyles: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rolled_back: 'bg-red-100 text-red-700',
}
const statusLabels: Record<string, string> = {
  pending_review: '待复核', reviewed: '已复核', approved: '已批准', rolled_back: '已回滚',
}
const diffTypeStyles: Record<string, string> = {
  surplus: 'bg-green-100 text-green-700',
  shortage: 'bg-red-100 text-red-700',
  missed: 'bg-orange-100 text-orange-700',
}
const diffTypeLabels: Record<string, string> = {
  surplus: '盘盈', shortage: '盘亏', missed: '漏盘',
}

export default function DiscrepancyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { operator, addToast } = useAppStore()
  const [detail, setDetail] = useState<DiscrepancyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [rollbackReason, setRollbackReason] = useState('')

  useEffect(() => { if (id) loadDetail() }, [id])

  async function loadDetail() {
    setLoading(true)
    try {
      const res = await getDiscrepancyById(Number(id))
      if (res.success && res.data) setDetail(res.data)
      else addToast('error', res.error || '加载失败')
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(pass: boolean) {
    if (!operator) { addToast('error', '请输入操作人'); return }
    try {
      const res = await reviewDiscrepancy(Number(id), operator, pass)
      if (res.success) { addToast('success', pass ? '复核通过' : '复核驳回'); await loadDetail() }
      else addToast('error', res.error || '操作失败')
    } catch { addToast('error', '网络错误') }
  }

  async function handleApprove() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    try {
      const res = await approveDiscrepancy(Number(id), operator)
      if (res.success) { addToast('success', '批准调整成功'); await loadDetail() }
      else addToast('error', res.error || '操作失败')
    } catch { addToast('error', '网络错误') }
  }

  async function handleRollback() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (!rollbackReason.trim()) { addToast('error', '请输入回滚原因'); return }
    try {
      const res = await rollbackDiscrepancy(Number(id), operator, rollbackReason)
      if (res.success) { addToast('success', '回滚成功'); setRollbackReason(''); await loadDetail() }
      else addToast('error', res.error || '操作失败')
    } catch { addToast('error', '网络错误') }
  }

  if (loading && !detail) return <div className="text-center py-12 text-slate-400">加载中...</div>
  if (!detail) return <div className="text-center py-12 text-slate-400">未找到数据</div>

  const { batch, lines } = detail

  return (
    <div className="space-y-6">
      <Link to="/discrepancies" className="inline-flex items-center gap-1.5 text-amber-600 hover:text-amber-700 text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> 返回列表
      </Link>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-800">{batch.batch_no}</h2>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[batch.status]}`}>
            {statusLabels[batch.status]}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-slate-500">创建人：</span>{batch.created_by}</div>
          <div><span className="text-slate-500">创建时间：</span>{batch.created_at}</div>
          <div><span className="text-slate-500">复核人：</span>{batch.reviewed_by || '-'}</div>
          <div><span className="text-slate-500">批准人：</span>{batch.approved_by || '-'}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left py-3 px-4">SKU</th>
              <th className="text-left py-3 px-4">名称</th>
              <th className="text-right py-3 px-4">账面数量</th>
              <th className="text-right py-3 px-4">实盘数量</th>
              <th className="text-right py-3 px-4">差异数量</th>
              <th className="text-left py-3 px-4">差异类型</th>
              <th className="text-left py-3 px-4">单位</th>
              <th className="text-left py-3 px-4">库位</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400">暂无明细</td></tr>
            ) : lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono text-xs">{l.sku}</td>
                <td className="py-2.5 px-4">{l.name}</td>
                <td className="py-2.5 px-4 text-right">{l.book_qty}</td>
                <td className="py-2.5 px-4 text-right">{l.physical_qty}</td>
                <td className={`py-2.5 px-4 text-right font-medium ${l.diff_qty > 0 ? 'text-green-600' : l.diff_qty < 0 ? 'text-red-600' : ''}`}>
                  {l.diff_qty > 0 ? '+' : ''}{l.diff_qty}
                </td>
                <td className="py-2.5 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${diffTypeStyles[l.diff_type]}`}>
                    {diffTypeLabels[l.diff_type]}
                  </span>
                </td>
                <td className="py-2.5 px-4">{l.unit}</td>
                <td className="py-2.5 px-4">{l.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">操作</h3>
        {batch.status === 'pending_review' && (
          <div className="flex items-center gap-3">
            <button onClick={() => handleReview(true)} className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">复核通过</button>
            <button onClick={() => handleReview(false)} className="bg-slate-400 hover:bg-slate-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">复核驳回</button>
          </div>
        )}
        {batch.status === 'reviewed' && (
          <button onClick={handleApprove} className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">批准调整</button>
        )}
        {batch.status === 'approved' && (
          <div className="space-y-3">
            <textarea
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              placeholder="请输入回滚原因"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-red-500 resize-none"
              rows={3}
            />
            <button onClick={handleRollback} className="bg-red-600 hover:bg-red-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">回滚调整</button>
          </div>
        )}
        {batch.status === 'rolled_back' && (
          <div className="text-sm text-slate-600">
            <span className="font-medium text-red-600">已回滚</span>
            {batch.rollback_reason && <span className="ml-2">原因：{batch.rollback_reason}</span>}
          </div>
        )}
      </div>

      <a
        href={`/api/discrepancies/${id}/export`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
      >
        <FileDown className="w-4 h-4" /> 导出差异报告
      </a>
    </div>
  )
}
