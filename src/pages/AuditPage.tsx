import { useState, useEffect } from 'react'
import { Upload, Calculator, CheckCircle, Check, Undo2, RefreshCw, FileDown } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getAuditLogs } from '@/api/client'
import type { AuditLogEntry } from '@shared/types'

const actionIcons: Record<string, React.ElementType> = {
  import_book_inventory: Upload,
  import_physical_inventory: Upload,
  calculate_discrepancy: Calculator,
  review_discrepancy: CheckCircle,
  approve_discrepancy: Check,
  rollback_discrepancy: Undo2,
}

export default function AuditPage() {
  const { addToast } = useAppStore()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const pageSize = 20
  const totalPages = Math.ceil(total / pageSize)

  useEffect(() => { loadLogs() }, [page])

  async function loadLogs() {
    setLoading(true)
    try {
      const res = await getAuditLogs(page, pageSize)
      if (res.success && res.data) {
        setLogs(res.data.data)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={loadLogs}
          disabled={loading}
          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
        <a
          href="/api/audit/export"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <FileDown className="w-4 h-4" /> 导出审计记录
        </a>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">操作</th>
              <th className="text-left py-3 px-4">实体类型</th>
              <th className="text-left py-3 px-4">实体ID</th>
              <th className="text-left py-3 px-4">操作人</th>
              <th className="text-left py-3 px-4">详情</th>
              <th className="text-left py-3 px-4">时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">暂无审计记录</td></tr>
            ) : logs.map((log) => {
              const Icon = actionIcons[log.action]
              return (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 px-4 text-slate-400">{log.id}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      {Icon && <Icon className="w-4 h-4 text-slate-500" />}
                      <span>{log.action}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">{log.entity_type}</td>
                  <td className="py-2.5 px-4">{log.entity_id}</td>
                  <td className="py-2.5 px-4">{log.operator}</td>
                  <td className="py-2.5 px-4 max-w-xs truncate">{log.detail}</td>
                  <td className="py-2.5 px-4 text-slate-500">{log.created_at}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-slate-600">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
