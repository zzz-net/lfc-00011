import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FileDown, ArrowLeft, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Filter, Clock, CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import {
  getDiscrepancyById,
  reviewDiscrepancy,
  approveDiscrepancy,
  rollbackDiscrepancy,
  getAdjustments,
  setDisposition,
  batchSetDisposition,
  checkDispositionPermission,
  getUserRole,
  getDispositionHistory,
} from '@/api/client'
import type { DiscrepancyDetail, InventoryAdjustment, DispositionStatus, DispositionHistoryEntry } from '@shared/types'

const statusStyles: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rolled_back: 'bg-red-100 text-red-700',
}
const statusLabels: Record<string, string> = {
  pending_review: '待复核', reviewed: '已复核', approved: '已批准', rolled_back: '已撤销',
}
const diffTypeStyles: Record<string, string> = {
  surplus: 'bg-green-100 text-green-700',
  shortage: 'bg-red-100 text-red-700',
  missed: 'bg-orange-100 text-orange-700',
}
const diffTypeLabels: Record<string, string> = {
  surplus: '盘盈', shortage: '盘亏', missed: '漏盘',
}
const adjTypeLabels: Record<string, string> = {
  original: '原调整', compensation: '补偿',
}
const adjTypeStyles: Record<string, string> = {
  original: 'bg-blue-100 text-blue-700',
  compensation: 'bg-purple-100 text-purple-700',
}

const dispStatusStyles: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  accepted_loss: 'bg-red-100 text-red-700',
  adjusted: 'bg-green-100 text-green-700',
  recounted: 'bg-blue-100 text-blue-700',
}
const dispStatusLabels: Record<string, string> = {
  pending: '待处理',
  accepted_loss: '已认亏',
  adjusted: '已调账',
  recounted: '已复盘',
}
const dispStatusOptions: { value: DispositionStatus; label: string }[] = [
  { value: 'pending', label: '待处理' },
  { value: 'accepted_loss', label: '已认亏' },
  { value: 'adjusted', label: '已调账' },
  { value: 'recounted', label: '已复盘' },
]

const PAGE_SIZE = 50

interface LineRowProps {
  line: DiscrepancyDetail['lines'][0]
  onSetDisposition: (lineId: number, status: DispositionStatus, remark: string) => void
  onViewHistory: (lineId: number) => void
  canDispose: boolean
  selected: boolean
  onToggleSelect: (lineId: number) => void
}

const LineRow = memo(function LineRow({
  line, onSetDisposition, onViewHistory, canDispose, selected, onToggleSelect,
}: LineRowProps) {
  const [localStatus, setLocalStatus] = useState<DispositionStatus>(
    (line.disposition?.status as DispositionStatus) || 'pending'
  )
  const [localRemark, setLocalRemark] = useState(line.disposition?.remark || '')
  const [expanded, setExpanded] = useState(false)

  const dispStatus = (line.disposition?.status as DispositionStatus) || 'pending'
  const dispRemark = line.disposition?.remark || ''
  const dispHandler = line.disposition?.handler || ''

  useEffect(() => {
    setLocalStatus(dispStatus)
    setLocalRemark(dispRemark)
  }, [dispStatus, dispRemark])

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="py-2.5 px-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(line.id)}
            className="rounded border-slate-300"
          />
        </td>
        <td className="py-2.5 px-3 font-mono text-xs">{line.sku}</td>
        <td className="py-2.5 px-3">{line.name}</td>
        <td className="py-2.5 px-3 text-right">{line.book_qty}</td>
        <td className="py-2.5 px-3 text-right">{line.physical_qty}</td>
        <td className={`py-2.5 px-3 text-right font-medium ${line.diff_qty > 0 ? 'text-green-600' : line.diff_qty < 0 ? 'text-red-600' : ''}`}>
          {line.diff_qty > 0 ? '+' : ''}{line.diff_qty}
        </td>
        <td className="py-2.5 px-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${diffTypeStyles[line.diff_type]}`}>
            {diffTypeLabels[line.diff_type]}
          </span>
        </td>
        <td className="py-2.5 px-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${dispStatusStyles[dispStatus]}`}>
            {dispStatusLabels[dispStatus]}
          </span>
        </td>
        <td className="py-2.5 px-3 text-xs text-slate-500 max-w-[120px] truncate" title={dispHandler}>{dispHandler || '-'}</td>
        <td className="py-2.5 px-3 text-xs text-slate-500 max-w-[120px] truncate" title={dispRemark}>{dispRemark || '-'}</td>
        <td className="py-2.5 px-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-amber-600 hover:text-amber-700 text-xs font-medium"
          >
            {expanded ? '收起' : '处置'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-amber-50/50">
          <td colSpan={11} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">处置状态</label>
                <select
                  value={localStatus}
                  onChange={(e) => setLocalStatus(e.target.value as DispositionStatus)}
                  className="border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {dispStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-500 mb-1">处置备注</label>
                <input
                  type="text"
                  value={localRemark}
                  onChange={(e) => setLocalRemark(e.target.value)}
                  placeholder="输入处置备注"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={() => { onSetDisposition(line.id, localStatus, localRemark); setExpanded(false) }}
                disabled={!canDispose}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded transition-colors"
              >
                提交
              </button>
              <button
                onClick={() => onViewHistory(line.id)}
                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm px-3 py-1.5 rounded transition-colors flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" /> 历史
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
})

export default function DiscrepancyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { operator, addToast } = useAppStore()
  const [detail, setDetail] = useState<DiscrepancyDetail | null>(null)
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([])
  const [loading, setLoading] = useState(false)
  const [rollbackReason, setRollbackReason] = useState('')

  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterSku, setFilterSku] = useState<string>('')
  const [filterDiffType, setFilterDiffType] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDispStatus, setBatchDispStatus] = useState<DispositionStatus>('pending')
  const [batchDispRemark, setBatchDispRemark] = useState('')
  const [canDispose, setCanDispose] = useState(false)

  const [historyLineId, setHistoryLineId] = useState<number | null>(null)
  const [historyEntries, setHistoryEntries] = useState<DispositionHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const batchId = Number(id)

  useEffect(() => {
    if (id) { loadDetail(); loadAdjustments() }
  }, [id])

  useEffect(() => {
    if (operator && batchId) {
      checkDispositionPermission(operator, batchId).then((res) => {
        if (res.success && res.data) {
          setCanDispose(res.data.allowed)
          if (!res.data.allowed) {
            addToast('info', `处置权限不足: ${res.data.reason}`)
          }
        }
      })
    }
  }, [operator, batchId])

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

  async function loadAdjustments() {
    try {
      const res = await getAdjustments(Number(id))
      if (res.success && res.data) setAdjustments(res.data)
    } catch {
      // ignore
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
      if (res.success) { addToast('success', '批准调整成功'); await loadDetail(); await loadAdjustments() }
      else addToast('error', res.error || '操作失败')
    } catch { addToast('error', '网络错误') }
  }

  async function handleRollback() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (!rollbackReason.trim()) { addToast('error', '请输入撤销原因'); return }
    try {
      const res = await rollbackDiscrepancy(Number(id), operator, rollbackReason)
      if (res.success) { addToast('success', '撤销成功'); setRollbackReason(''); await loadDetail(); await loadAdjustments() }
      else addToast('error', res.error || '操作失败')
    } catch { addToast('error', '网络错误') }
  }

  const handleSetDisposition = useCallback(async (lineId: number, status: DispositionStatus, remark: string) => {
    if (!operator) { addToast('error', '请输入操作人'); return }
    try {
      const res = await setDisposition(lineId, batchId, status, remark, operator, operator)
      if (res.success) {
        addToast('success', `处置状态已更新为: ${dispStatusLabels[status]}`)
        await loadDetail()
      } else {
        addToast('error', res.error || '处置失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }, [operator, batchId])

  async function handleBatchDisposition() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    if (selectedIds.size === 0) { addToast('error', '请先选择差异行'); return }
    try {
      const res = await batchSetDisposition(
        Array.from(selectedIds), batchId, batchDispStatus, batchDispRemark, operator, operator
      )
      if (res.success) {
        addToast('success', `批量处置 ${selectedIds.size} 条差异行`)
        setSelectedIds(new Set())
        setBatchDispRemark('')
        await loadDetail()
      } else {
        addToast('error', res.error || '批量处置失败')
      }
    } catch {
      addToast('error', '网络错误')
    }
  }

  async function handleViewHistory(lineId: number) {
    try {
      const res = await getDispositionHistory(lineId)
      if (res.success && res.data) {
        setHistoryEntries(res.data)
        setHistoryLineId(lineId)
        setHistoryOpen(true)
      }
    } catch {
      addToast('error', '获取历史失败')
    }
  }

  function toggleSelect(lineId: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  function toggleSelectAll(ids: number[]) {
    if (ids.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ids))
    }
  }

  const filteredLines = useMemo(() => {
    if (!detail) return []
    let lines = detail.lines
    if (filterStatus) {
      lines = lines.filter(l => (l.disposition?.status || 'pending') === filterStatus)
    }
    if (filterSku) {
      const kw = filterSku.toLowerCase()
      lines = lines.filter(l => l.sku.toLowerCase().includes(kw))
    }
    if (filterDiffType) {
      lines = lines.filter(l => l.diff_type === filterDiffType)
    }
    return lines
  }, [detail, filterStatus, filterSku, filterDiffType])

  const totalPages = Math.max(1, Math.ceil(filteredLines.length / PAGE_SIZE))
  const pagedLines = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredLines.slice(start, start + PAGE_SIZE)
  }, [filteredLines, currentPage])

  useEffect(() => { setCurrentPage(1) }, [filterStatus, filterSku, filterDiffType])

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
        {batch.status === 'rolled_back' && (
          <div className="mt-3 text-sm">
            <span className="text-slate-500">撤销人：</span>{batch.rolled_back_by}
            <span className="ml-4 text-slate-500">撤销原因：</span>{batch.rollback_reason}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">差异明细（含处置状态）</h3>
          <span className="text-xs text-slate-400">共 {filteredLines.length} 条{filteredLines.length !== lines.length ? ` / 总 ${lines.length} 条` : ''}</span>
        </div>

        <div className="px-4 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">筛选：</span>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">全部处置状态</option>
            {dispStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filterDiffType}
            onChange={(e) => setFilterDiffType(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">全部差异类型</option>
            <option value="surplus">盘盈</option>
            <option value="shortage">盘亏</option>
            <option value="missed">漏盘</option>
          </select>
          <input
            type="text"
            value={filterSku}
            onChange={(e) => setFilterSku(e.target.value)}
            placeholder="搜索 SKU"
            className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500 w-32"
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-amber-700">已选 {selectedIds.size} 条</span>
            <select
              value={batchDispStatus}
              onChange={(e) => setBatchDispStatus(e.target.value as DispositionStatus)}
              className="border border-amber-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500 bg-white"
            >
              {dispStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={batchDispRemark}
              onChange={(e) => setBatchDispRemark(e.target.value)}
              placeholder="批量处置备注"
              className="border border-amber-300 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500 w-40 bg-white"
            />
            <button
              onClick={handleBatchDisposition}
              disabled={!canDispose}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs px-3 py-1 rounded transition-colors"
            >
              批量处置
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              取消选择
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                <th className="text-left py-2.5 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={pagedLines.length > 0 && pagedLines.every(l => selectedIds.has(l.id))}
                    onChange={() => toggleSelectAll(pagedLines.map(l => l.id))}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="text-left py-2.5 px-3">SKU</th>
                <th className="text-left py-2.5 px-3">名称</th>
                <th className="text-right py-2.5 px-3">账面</th>
                <th className="text-right py-2.5 px-3">实盘</th>
                <th className="text-right py-2.5 px-3">差异</th>
                <th className="text-left py-2.5 px-3">类型</th>
                <th className="text-left py-2.5 px-3">处置状态</th>
                <th className="text-left py-2.5 px-3">经办人</th>
                <th className="text-left py-2.5 px-3">备注</th>
                <th className="text-left py-2.5 px-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedLines.length === 0 ? (
                <tr><td colSpan={11} className="py-8 text-center text-slate-400">暂无匹配的差异明细</td></tr>
              ) : pagedLines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  onSetDisposition={handleSetDisposition}
                  onViewHistory={handleViewHistory}
                  canDispose={canDispose}
                  selected={selectedIds.has(l.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              第 {currentPage} / {totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">库存调整流水</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="text-left py-3 px-4">流水号</th>
                <th className="text-left py-3 px-4">SKU</th>
                <th className="text-left py-3 px-4">名称</th>
                <th className="text-left py-3 px-4">类型</th>
                <th className="text-left py-3 px-4">方向</th>
                <th className="text-right py-3 px-4">数量</th>
                <th className="text-left py-3 px-4">操作人</th>
                <th className="text-left py-3 px-4">原因</th>
                <th className="text-left py-3 px-4">时间</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-xs">#{a.id}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{a.sku}</td>
                  <td className="py-2.5 px-4">{a.name}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${adjTypeStyles[a.adjustment_type]}`}>
                      {adjTypeLabels[a.adjustment_type]}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    {a.direction === 'increase' ? (
                      <span className="inline-flex items-center gap-1 text-green-600"><TrendingUp className="w-3.5 h-3.5" /> 增加</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600"><TrendingDown className="w-3.5 h-3.5" /> 减少</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-medium">{a.quantity}</td>
                  <td className="py-2.5 px-4">{a.operator}</td>
                  <td className="py-2.5 px-4 text-slate-500 max-w-[200px] truncate" title={a.reason}>{a.reason}</td>
                  <td className="py-2.5 px-4 text-slate-500 text-xs">{a.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              placeholder="请输入撤销原因"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-red-500 resize-none"
              rows={3}
            />
            <button onClick={handleRollback} className="bg-red-600 hover:bg-red-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">撤销调整</button>
          </div>
        )}
        {batch.status === 'rolled_back' && (
          <div className="text-sm text-slate-600">
            <span className="font-medium text-red-600">已撤销</span>
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
        <FileDown className="w-4 h-4" /> 导出完整报告（含处置历史+审计日志）
      </a>

      {historyOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setHistoryOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                差异行 #{historyLineId} 处置历史追溯
              </h3>
              <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="p-5">
              {historyEntries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">暂无处置历史</p>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5">
                        {entry.to_status === 'adjusted' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : entry.to_status === 'accepted_loss' ? (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        ) : entry.to_status === 'recounted' ? (
                          <RotateCcw className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${dispStatusStyles[entry.from_status]}`}>
                            {dispStatusLabels[entry.from_status]}
                          </span>
                          <span className="text-slate-400">&rarr;</span>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${dispStatusStyles[entry.to_status]}`}>
                            {dispStatusLabels[entry.to_status]}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          操作人: {entry.operator} | 经办人: {entry.handler} | 时间: {entry.created_at}
                        </div>
                        {entry.remark && (
                          <div className="mt-0.5 text-xs text-slate-600">备注: {entry.remark}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
