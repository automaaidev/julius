import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="container"><p>Carregando...</p></div>
  if (!session) return <Navigate to="/admin/login" replace />

  return children
}
