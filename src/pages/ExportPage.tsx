import { useState, useEffect } from 'react'
import { RefreshCw, FileDown } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getCurrentInventory } from '@/api/client'
import type { CurrentInventoryItem } from '@shared/types'

export default function ExportPage() {
  const { addToast } = useAppStore()
  const [items, setItems] = useState<CurrentInventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const res = await getCurrentInventory()
      if (res.success && res.data) setItems(res.data)
      else addToast('error', res.error || '加载失败')
    } catch {
      addToast('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const totalItems = items.length
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-slate-500">物品种类</p>
          <p className="text-2xl font-bold text-slate-800">{totalItems}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-slate-500">总数量</p>
          <p className="text-2xl font-bold text-slate-800">{totalQuantity}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={loadItems}
          disabled={loading}
          className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
        <a
          href="/api/inventory/export"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          <FileDown className="w-4 h-4" /> 导出库存 CSV
        </a>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left py-3 px-4">SKU</th>
              <th className="text-left py-3 px-4">名称</th>
              <th className="text-right py-3 px-4">数量</th>
              <th className="text-left py-3 px-4">单位</th>
              <th className="text-left py-3 px-4">库位</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">暂无库存数据</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono text-xs">{item.sku}</td>
                <td className="py-2.5 px-4">{item.name}</td>
                <td className="py-2.5 px-4 text-right">{item.quantity}</td>
                <td className="py-2.5 px-4">{item.unit}</td>
                <td className="py-2.5 px-4">{item.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
