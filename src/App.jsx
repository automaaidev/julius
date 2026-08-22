import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import QueueStatus from './pages/QueueStatus'
import MyQueue from './pages/MyQueue'
import Login from './admin/Login'
import Dashboard from './admin/Dashboard'
import ProtectedRoute from './admin/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fila/:id" element={<QueueStatus />} />
        <Route path="/minha-fila" element={<MyQueue />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
