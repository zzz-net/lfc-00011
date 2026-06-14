import { create } from 'zustand'
import type { UserRoleType } from '@shared/types'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  operator: string
  setOperator: (name: string) => void
  role: UserRoleType | null
  setRole: (role: UserRoleType | null) => void
  toasts: Toast[]
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: number) => void
}

let toastId = 0

export const useAppStore = create<AppState>((set) => ({
  operator: (() => {
    try { return localStorage.getItem('warehouse_operator') || '' } catch { return '' }
  })(),
  setOperator: (name) => {
    try { localStorage.setItem('warehouse_operator', name) } catch {}
    set({ operator: name })
  },
  role: null,
  setRole: (role) => set({ role }),
  toasts: [],
  addToast: (type, message) => {
    const id = ++toastId
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
