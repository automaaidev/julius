import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import QueueStatus from './pages/QueueStatus'
import MyQueue from './pages/MyQueue'
import Login from './admin/Login'
import Dashboard from './admin/Dashboard'
import ProtectedRoute from './admin/ProtectedRoute'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* sem site institucional: a casa só usa o sistema de fila */}
        <Route path="/" element={<Navigate to="/minha-fila" replace />} />
        <Route path="/fila/:id" element={<QueueStatus />} />
        <Route path="/minha-fila" element={<MyQueue />} />
        <Route path="/app/admin/login" element={<Login />} />
        <Route
          path="/app/admin"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Analytics />
    </HashRouter>
  )
}
