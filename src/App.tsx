import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import ImportPage from '@/pages/ImportPage'
import DiscrepancyListPage from '@/pages/DiscrepancyListPage'
import DiscrepancyDetailPage from '@/pages/DiscrepancyDetailPage'
import AuditPage from '@/pages/AuditPage'
import ExportPage from '@/pages/ExportPage'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/discrepancies" element={<DiscrepancyListPage />} />
          <Route path="/discrepancy/:id" element={<DiscrepancyDetailPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Route>
      </Routes>
    </Router>
  )
}
