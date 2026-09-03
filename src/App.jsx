import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
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
        <Route path="/" element={<Home />} />
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
    </HashRouter>
  )
}
