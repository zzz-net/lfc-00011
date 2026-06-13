import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, AlertTriangle, Calculator, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getDiscrepancies, calculateDiscrepancy } from '@/api/client'
import type { DiscrepancyBatch } from '@shared/types'

const statusStyles: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rolled_back: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  pending_review: '待复核',
  reviewed: '已复核',
  approved: '已批准',
  rolled_back: '已回滚',
}

export default function DiscrepancyListPage() {
  const { operator, addToast } = useAppStore()
  const [batches, setBatches] = useState<DiscrepancyBatch[]>([])
  const [stats, setStats] = useState({ surplus: 0, shortage: 0, missed: 0 })
  const [loading, setLoading] = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)

  useEffect(() => { loadBatches() }, [])

  async function loadBatches() {
    setLoading(true)
    try {
      const res = await getDiscrepancies()
      if (res.success && res.data) {
        setBatches(res.data.batches)
        setStats(res.data.stats)
      } else {
        addToast('error', res.error || '加载失败')
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function handleCalculate() {
    if (!operator) { addToast('error', '请输入操作人'); return }
    setCalcLoading(true)
    try {
      const res = await calculateDiscrepancy(operator)
      if (res.success) {
        addToast('success', '差异计算完成')
        await loadBatches()
      } else {
        addToast('error', res.error || '计算失败')
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setCalcLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-green-100 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">盘盈项</p>
            <p className="text-2xl font-bold text-slate-800">{stats.surplus}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-red-100 flex items-center justify-center">
            <TrendingDown className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">盘亏项</p>
            <p className="text-2xl font-bold text-slate-800">{stats.shortage}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-orange-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">漏盘项</p>
            <p className="text-2xl font-bold text-slate-800">{stats.missed}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleCalculate}
          disabled={calcLoading || !operator}
          className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <Calculator className="w-4 h-4" />
          {calcLoading ? '计算中...' : '计算差异'}
        </button>
        <button
          onClick={loadBatches}
          disabled={loading}
          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left py-3 px-4">批次号</th>
              <th className="text-left py-3 px-4">创建人</th>
              <th className="text-left py-3 px-4">状态</th>
              <th className="text-right py-3 px-4">行数</th>
              <th className="text-left py-3 px-4">创建时间</th>
              <th className="text-left py-3 px-4">复核人</th>
              <th className="text-left py-3 px-4">批准人</th>
              <th className="text-left py-3 px-4">回滚人</th>
              <th className="text-left py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">暂无差异批次</td></tr>
            ) : batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono text-xs">{b.batch_no}</td>
                <td className="py-2.5 px-4">{b.created_by}</td>
                <td className="py-2.5 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[b.status]}`}>
                    {statusLabels[b.status]}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right">{b.line_count ?? 0}</td>
                <td className="py-2.5 px-4 text-slate-500">{b.created_at}</td>
                <td className="py-2.5 px-4">{b.reviewed_by || '-'}</td>
                <td className="py-2.5 px-4">{b.approved_by || '-'}</td>
                <td className="py-2.5 px-4">{b.rolled_back_by || '-'}</td>
                <td className="py-2.5 px-4">
                  <Link to={`/discrepancy/${b.id}`} className="text-amber-600 hover:text-amber-700 font-medium">
                    查看详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
