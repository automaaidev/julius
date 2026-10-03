import { HashRouter, Routes, Route, Navigate, useLocation, matchPath } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import QueueStatus from './pages/QueueStatus'
import MyQueue from './pages/MyQueue'
import Login from './admin/Login'
import Dashboard from './admin/Dashboard'
import ProtectedRoute from './admin/ProtectedRoute'
import NotFound from './pages/NotFound'

// Speed Insights agrupa as métricas por rota. Com HashRouter o pathname real do
// navegador é sempre "/", então passa a rota do roteador (a de /fila/:id vira
// um padrão só, senão cada música criaria uma rota própria no painel).
function Medicao() {
  const { pathname } = useLocation()
  const route = matchPath('/fila/:id', pathname) ? '/fila/[id]' : pathname
  return <SpeedInsights route={route} />
}

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
      <Medicao />
    </HashRouter>
  )
}
