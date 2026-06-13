import { NavLink, Outlet } from 'react-router-dom'
import { Warehouse, Upload, ClipboardList, ScrollText, Download, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

const navItems = [
  { to: '/import', icon: Upload, label: '数据导入' },
  { to: '/discrepancies', icon: ClipboardList, label: '差异管理' },
  { to: '/audit', icon: ScrollText, label: '审计记录' },
  { to: '/export', icon: Download, label: '库存导出' },
]

const toastStyles: Record<string, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
}

export default function Layout() {
  const { operator, setOperator, toasts, removeToast } = useAppStore()

  return (
    <div className="flex min-h-screen" style={{ fontFamily: '"Noto Sans SC", sans-serif' }}>
      <aside className="w-60 bg-slate-800 text-white flex flex-col h-screen fixed left-0 top-0">
        <div className="px-5 py-6 flex items-center gap-3 border-b border-slate-700">
          <Warehouse className="w-7 h-7 text-amber-500" />
          <span className="text-lg font-bold tracking-wide">盘点差异处理</span>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700 border-l-4 border-amber-500 text-white'
                    : 'border-l-4 border-transparent text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="操作人"
            className="w-full bg-slate-700 text-white text-xs rounded px-3 py-2 placeholder-slate-400 outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </aside>

      <main className="ml-60 flex-1 bg-slate-50 min-h-screen p-6">
        <Outlet />
      </main>

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${toastStyles[toast.type]} text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in min-w-[280px]`}
          >
            <span className="flex-1">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="hover:opacity-80">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
