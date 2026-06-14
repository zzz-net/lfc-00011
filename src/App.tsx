import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import DashboardPage from '@/pages/DashboardPage'
import ImportPage from '@/pages/ImportPage'
import DiscrepancyListPage from '@/pages/DiscrepancyListPage'
import DiscrepancyDetailPage from '@/pages/DiscrepancyDetailPage'
import AuditPage from '@/pages/AuditPage'
import ExportPage from '@/pages/ExportPage'
import PlanListPage from '@/pages/PlanListPage'
import PlanDetailPage from '@/pages/PlanDetailPage'
import PlanFormPage from '@/pages/PlanFormPage'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/discrepancies" element={<DiscrepancyListPage />} />
          <Route path="/discrepancy/:id" element={<DiscrepancyDetailPage />} />
          <Route path="/plans" element={<PlanListPage />} />
          <Route path="/plans/new" element={<PlanFormPage />} />
          <Route path="/plans/:id" element={<PlanDetailPage />} />
          <Route path="/plans/:id/edit" element={<PlanFormPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Route>
      </Routes>
    </Router>
  )
}
