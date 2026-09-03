import { Link } from 'react-router-dom'
import { Mic2, ArrowLeft } from 'lucide-react'
import './queue.css'

export default function NotFound() {
  return (
    <div className="q-page">
      <div className="q-shell">
        <div className="q-top">
          <Link to="/" className="q-brand">
            <span className="q-brand__mark"><Mic2 size={17} strokeWidth={2.4} /></span>
            JULIU&apos;S
          </Link>
        </div>
        <div className="q-card q-big">
          <div className="q-big__num">404</div>
          <div className="q-big__label">Essa página não existe</div>
          <p style={{ marginTop: '1.2rem' }}>
            <Link to="/" className="q-btn q-btn--primary">
              <ArrowLeft size={16} /> Voltar ao início
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
