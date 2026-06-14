import { useEffect, useState } from 'react'
import { RefreshCw, Package, FileText, TrendingUp, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { getDashboardStats } from '@/api/client'
import type { DashboardStats } from '@shared/types'
import { useAppStore } from '@/store/appStore'

const dispStatusLabels: Record<string, string> = {
  pending: '待处理',
  accepted_loss: '已认亏',
  adjusted: '已调账',
  recounted: '已复盘',
}
const dispStatusColors: Record<string, string> = {
  pending: 'bg-slate-400',
  accepted_loss: 'bg-red-500',
  adjusted: 'bg-green-500',
  recounted: 'bg-blue-500',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const { addToast } = useAppStore()

  async function loadStats() {
    setLoading(true)
    try {
      const res = await getDashboardStats()
      if (res.success && res.data) {
        setStats(res.data)
      } else {
        addToast('error', res.error || '加载统计失败')
      }
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  if (loading && !stats) return <div className="text-center py-12 text-slate-400">加载中...</div>
  if (!stats) return <div className="text-center py-12 text-slate-400">暂无数据</div>

  const totalDiffQty =
    stats.diffAmountDistribution.surplus.totalAbsQty +
    stats.diffAmountDistribution.shortage.totalAbsQty +
    stats.diffAmountDistribution.missed.totalAbsQty

  const maxQty = Math.max(
    stats.diffAmountDistribution.surplus.totalAbsQty,
    stats.diffAmountDistribution.shortage.totalAbsQty,
    stats.diffAmountDistribution.missed.totalAbsQty,
    1
  )

  const bars = [
    {
      key: 'surplus',
      label: '盘盈',
      count: stats.diffAmountDistribution.surplus.count,
      qty: stats.diffAmountDistribution.surplus.totalAbsQty,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgLight: 'bg-green-50',
    },
    {
      key: 'shortage',
      label: '盘亏',
      count: stats.diffAmountDistribution.shortage.count,
      qty: stats.diffAmountDistribution.shortage.totalAbsQty,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgLight: 'bg-red-50',
    },
    {
      key: 'missed',
      label: '漏盘',
      count: stats.diffAmountDistribution.missed.count,
      qty: stats.diffAmountDistribution.missed.totalAbsQty,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      bgLight: 'bg-orange-50',
    },
  ]

  // 饼图 - 处置状态占比（使用 conic-gradient CSS）
  const dispItems = stats.dispositionStatusDistribution
  let gradientParts: string[] = []
  let accumulated = 0
  const dispColors = ['#94a3b8', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b']
  dispItems.forEach((item, idx) => {
    const color = dispStatusColors[item.status]
      ? dispStatusColors[item.status].replace('bg-', '')
      : dispColors[idx % dispColors.length]
    const hexMap: Record<string, string> = {
      'slate-400': '#94a3b8',
      'red-500': '#ef4444',
      'green-500': '#22c55e',
      'blue-500': '#3b82f6',
    }
    const hex = hexMap[color] || dispColors[idx % dispColors.length]
    const start = accumulated
    const end = accumulated + item.percentage
    if (item.percentage > 0) {
      gradientParts.push(`${hex} ${start}% ${end}%`)
    }
    accumulated = end
  })
  const pieGradient = gradientParts.length > 0
    ? `conic-gradient(${gradientParts.join(', ')})`
    : 'conic-gradient(#e2e8f0 0% 100%)'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">数据仪表盘</h1>
        <button
          onClick={loadStats}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新数据
        </button>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">差异批次</div>
              <div className="text-2xl font-bold text-slate-800">{stats.totalBatches}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">差异行数</div>
              <div className="text-2xl font-bold text-slate-800">{stats.totalLines}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">SKU 种类</div>
              <div className="text-2xl font-bold text-slate-800">{stats.inventoryStats.skuCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">库存总量</div>
              <div className="text-2xl font-bold text-slate-800">{stats.inventoryStats.totalQuantity.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 盘盈盘亏数量分布（柱状图） */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">盘盈盘亏差异分布</h3>
            <p className="text-xs text-slate-400 mt-0.5">差异数量绝对值合计：{totalDiffQty.toLocaleString()}</p>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {bars.map((bar) => (
                <div key={bar.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded ${bar.color}`}></span>
                      <span className="text-sm font-medium text-slate-700">{bar.label}</span>
                      <span className="text-xs text-slate-400">({bar.count} 条)</span>
                    </div>
                    <span className={`text-sm font-bold ${bar.textColor}`}>{bar.qty.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`${bar.color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                      style={{ width: `${(bar.qty / maxQty) * 100}%`, minWidth: bar.qty > 0 ? '8px' : '0' }}
                    >
                      {bar.qty > 0 && (bar.qty / maxQty) > 0.2 && (
                        <span className="text-[10px] font-medium text-white">
                          {Math.round((bar.qty / (totalDiffQty || 1)) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 各处置状态占比（饼图） */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">处置状态占比</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              共 {dispItems.reduce((s, i) => s + i.count, 0)} 条处置记录
            </p>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-6">
              <div
                className="w-36 h-36 rounded-full shrink-0 shadow-inner"
                style={{ background: pieGradient }}
              />
              <div className="flex-1 space-y-2">
                {dispItems.length === 0 ? (
                  <p className="text-slate-400 text-sm">暂无处置记录</p>
                ) : (
                  dispItems.map((item) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-3 h-3 rounded ${dispStatusColors[item.status] || 'bg-slate-400'}`}></span>
                        <span className="text-sm text-slate-700">{dispStatusLabels[item.status] || item.status}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{item.count} 条</span>
                        <span className="text-sm font-semibold text-slate-800 w-12 text-right">{item.percentage}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 最近批次审批通过率 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">最近批次审批通过率</h3>
          <p className="text-xs text-slate-400 mt-0.5">统计最近 10 个差异批次</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className={`p-4 rounded-lg ${stats.recentApprovalRate.totalBatches === 0 ? 'bg-slate-50' : 'bg-blue-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Clock className={`w-4 h-4 ${stats.recentApprovalRate.totalBatches === 0 ? 'text-slate-400' : 'text-blue-600'}`} />
                <span className={`text-xs ${stats.recentApprovalRate.totalBatches === 0 ? 'text-slate-400' : 'text-blue-600'}`}>总批次数</span>
              </div>
              <div className={`text-3xl font-bold ${stats.recentApprovalRate.totalBatches === 0 ? 'text-slate-500' : 'text-blue-700'}`}>
                {stats.recentApprovalRate.totalBatches}
              </div>
            </div>
            <div className={`p-4 rounded-lg ${stats.recentApprovalRate.reviewedBatches === 0 ? 'bg-slate-50' : 'bg-amber-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className={`w-4 h-4 ${stats.recentApprovalRate.reviewedBatches === 0 ? 'text-slate-400' : 'text-amber-600'}`} />
                <span className={`text-xs ${stats.recentApprovalRate.reviewedBatches === 0 ? 'text-slate-400' : 'text-amber-600'}`}>已复核</span>
              </div>
              <div className={`text-3xl font-bold ${stats.recentApprovalRate.reviewedBatches === 0 ? 'text-slate-500' : 'text-amber-700'}`}>
                {stats.recentApprovalRate.reviewedBatches}
                <span className="text-sm font-normal ml-1">({stats.recentApprovalRate.reviewPassRate}%)</span>
              </div>
            </div>
            <div className={`p-4 rounded-lg ${stats.recentApprovalRate.approvedBatches === 0 ? 'bg-slate-50' : 'bg-green-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className={`w-4 h-4 ${stats.recentApprovalRate.approvedBatches === 0 ? 'text-slate-400' : 'text-green-600'}`} />
                <span className={`text-xs ${stats.recentApprovalRate.approvedBatches === 0 ? 'text-slate-400' : 'text-green-600'}`}>已批准</span>
              </div>
              <div className={`text-3xl font-bold ${stats.recentApprovalRate.approvedBatches === 0 ? 'text-slate-500' : 'text-green-700'}`}>
                {stats.recentApprovalRate.approvedBatches}
                <span className="text-sm font-normal ml-1">({stats.recentApprovalRate.approvalRate}%)</span>
              </div>
            </div>
          </div>

          {/* 进度条展示 */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">复核通过率</span>
                <span className="font-medium text-slate-700">{stats.recentApprovalRate.reviewPassRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.recentApprovalRate.reviewPassRate}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">审批通过率</span>
                <span className="font-medium text-slate-700">{stats.recentApprovalRate.approvalRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className="bg-green-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.recentApprovalRate.approvalRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
