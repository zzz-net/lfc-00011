import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import {
  importBookInventory,
  importPhysicalInventory,
  getBookInventory,
  getPhysicalInventory,
} from '@/api/client'
import type { BookInventoryItem, PhysicalInventoryItem } from '@shared/types'

export default function ImportPage() {
  const { operator, addToast } = useAppStore()
  const [bookFile, setBookFile] = useState<File | null>(null)
  const [physicalFile, setPhysicalFile] = useState<File | null>(null)
  const [bookLoading, setBookLoading] = useState(false)
  const [physicalLoading, setPhysicalLoading] = useState(false)
  const [bookData, setBookData] = useState<BookInventoryItem[]>([])
  const [physicalData, setPhysicalData] = useState<PhysicalInventoryItem[]>([])
  const bookInputRef = useRef<HTMLInputElement>(null)
  const physicalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadBookData()
    loadPhysicalData()
  }, [])

  async function loadBookData() {
    const res = await getBookInventory()
    if (res.success && res.data) setBookData(res.data)
  }

  async function loadPhysicalData() {
    const res = await getPhysicalInventory()
    if (res.success && res.data) setPhysicalData(res.data)
  }

  async function handleBookImport() {
    if (!bookFile || !operator) return
    setBookLoading(true)
    try {
      const res = await importBookInventory(bookFile, operator)
      if (res.success && res.data) {
        addToast('success', `账面库存导入成功，批次号：${res.data.batchNo}，共 ${res.data.count} 条`)
        setBookFile(null)
        if (bookInputRef.current) bookInputRef.current.value = ''
        await loadBookData()
      } else {
        addToast('error', res.error || '导入失败')
      }
    } catch {
      addToast('error', '网络错误，导入失败')
    } finally {
      setBookLoading(false)
    }
  }

  async function handlePhysicalImport() {
    if (!physicalFile || !operator) return
    setPhysicalLoading(true)
    try {
      const res = await importPhysicalInventory(physicalFile, operator)
      if (res.success && res.data) {
        addToast('success', `实盘数据导入成功，批次号：${res.data.batchNo}，共 ${res.data.count} 条`)
        setPhysicalFile(null)
        if (physicalInputRef.current) physicalInputRef.current.value = ''
        await loadPhysicalData()
      } else {
        addToast('error', res.error || '导入失败')
      }
    } catch {
      addToast('error', '网络错误，导入失败')
    } finally {
      setPhysicalLoading(false)
    }
  }

  function FileDropZone({
    label,
    file,
    inputRef,
    onFileChange,
  }: {
    label: string
    file: File | null
    inputRef: React.RefObject<HTMLInputElement | null>
    onFileChange: (f: File | null) => void
  }) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">{label}</h2>
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-amber-500 hover:bg-amber-50/30 transition-colors"
        >
          <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
              <FileText className="w-4 h-4" />
              <span>{file.name}</span>
            </div>
          ) : (
            <p className="text-sm text-slate-500">点击选择 CSV 文件</p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <FileDropZone
            label="账面库存导入"
            file={bookFile}
            inputRef={bookInputRef}
            onFileChange={setBookFile}
          />
          <button
            onClick={handleBookImport}
            disabled={!bookFile || !operator || bookLoading}
            className="mt-4 w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {bookLoading ? '导入中...' : '导入'}
          </button>
        </div>

        <div>
          <FileDropZone
            label="实盘数据导入"
            file={physicalFile}
            inputRef={physicalInputRef}
            onFileChange={setPhysicalFile}
          />
          <button
            onClick={handlePhysicalImport}
            disabled={!physicalFile || !operator || physicalLoading}
            className="mt-4 w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {physicalLoading ? '导入中...' : '导入'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">当前账面库存</h2>
            <button onClick={loadBookData} className="text-amber-600 hover:text-amber-700 text-sm flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> 刷新
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 px-3">SKU</th>
                  <th className="text-left py-2 px-3">名称</th>
                  <th className="text-right py-2 px-3">数量</th>
                  <th className="text-left py-2 px-3">单位</th>
                  <th className="text-left py-2 px-3">库位</th>
                </tr>
              </thead>
              <tbody>
                {bookData.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">暂无数据</td></tr>
                ) : bookData.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-xs">{item.sku}</td>
                    <td className="py-2 px-3">{item.name}</td>
                    <td className="py-2 px-3 text-right">{item.quantity}</td>
                    <td className="py-2 px-3">{item.unit}</td>
                    <td className="py-2 px-3">{item.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">当前实盘数据</h2>
            <button onClick={loadPhysicalData} className="text-amber-600 hover:text-amber-700 text-sm flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> 刷新
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 px-3">SKU</th>
                  <th className="text-left py-2 px-3">名称</th>
                  <th className="text-right py-2 px-3">数量</th>
                  <th className="text-left py-2 px-3">单位</th>
                  <th className="text-left py-2 px-3">库位</th>
                  <th className="text-left py-2 px-3">操作人</th>
                </tr>
              </thead>
              <tbody>
                {physicalData.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">暂无数据</td></tr>
                ) : physicalData.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-xs">{item.sku}</td>
                    <td className="py-2 px-3">{item.name}</td>
                    <td className="py-2 px-3 text-right">{item.quantity}</td>
                    <td className="py-2 px-3">{item.unit}</td>
                    <td className="py-2 px-3">{item.location}</td>
                    <td className="py-2 px-3">{item.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
