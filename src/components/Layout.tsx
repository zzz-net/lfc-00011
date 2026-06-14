import { NavLink, Outlet } from 'react-router-dom'
import { Warehouse, Upload, ClipboardList, ScrollText, Download, X, Shield, LayoutDashboard } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useState, useEffect } from 'react'
import { getUserRole, setUserRole } from '@/api/client'
import type { UserRoleType } from '@shared/types'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
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
  const { operator, setOperator, toasts, removeToast, role, setRole } = useAppStore()
  const [showRoleSelect, setShowRoleSelect] = useState(false)

  useEffect(() => {
    if (operator) {
      getUserRole(operator).then((res) => {
        if (res.success && res.data) {
          setRole(res.data.role as UserRoleType)
        } else {
          setRole(null)
        }
      })
    } else {
      setRole(null)
    }
  }, [operator])

  async function handleRoleChange(newRole: UserRoleType) {
    if (!operator) return
    const res = await setUserRole(operator, newRole)
    if (res.success && res.data) {
      setRole(res.data.role as UserRoleType)
      setShowRoleSelect(false)
    }
  }

  const roleLabels: Record<string, string> = {
    approver: '审批人',
    handler: '处置人',
    admin: '管理员',
  }
  const roleColors: Record<string, string> = {
    approver: 'bg-blue-600',
    handler: 'bg-amber-600',
    admin: 'bg-purple-600',
  }

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

        <div className="px-4 py-4 border-t border-slate-700 space-y-2">
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="操作人"
            className="w-full bg-slate-700 text-white text-xs rounded px-3 py-2 placeholder-slate-400 outline-none focus:ring-1 focus:ring-amber-500"
          />
          {operator && (
            <div className="relative">
              <button
                onClick={() => setShowRoleSelect(!showRoleSelect)}
                className="w-full flex items-center gap-2 bg-slate-700/50 rounded px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-300">角色：</span>
                {role ? (
                  <span className={`${roleColors[role]} text-white px-1.5 py-0.5 rounded text-[10px] font-medium`}>
                    {roleLabels[role]}
                  </span>
                ) : (
                  <span className="text-slate-500">未设置</span>
                )}
              </button>
              {showRoleSelect && (
                <div className="absolute bottom-full left-0 w-full bg-slate-700 rounded shadow-lg mb-1 py-1 z-10">
                  {(['handler', 'approver', 'admin'] as UserRoleType[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRoleChange(r)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-600 transition-colors ${role === r ? 'text-amber-400 font-medium' : 'text-slate-300'}`}
                    >
                      <span className={`${roleColors[r]} text-white px-1.5 py-0.5 rounded text-[10px] font-medium mr-2`}>
                        {roleLabels[r]}
                      </span>
                      {role === r && '✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
