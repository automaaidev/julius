import { Component } from 'react'
import './pages/queue.css'

// react-router-dom's <Routes> não tem errorElement (isso só existe em
// createBrowserRouter/createHashRouter) — sem isso, um erro de render em
// qualquer tela derruba a árvore inteira e some tudo (fundo sólido, nada
// visível). Isolamos o dano num boundary por rota em vez de deixar sumir
// o app inteiro.
export default class ErrorBoundary extends Component {
  state = { erro: null }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    console.error('Erro capturado pelo ErrorBoundary:', erro, info)
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="q-page">
          <div className="q-shell">
            <div className="q-card">
              <h1 style={{ marginBottom: '0.5rem' }}>Algo deu errado</h1>
              <p className="q-note q-note--soft" style={{ textAlign: 'left', marginBottom: '1rem' }}>
                {this.state.erro.message || 'Erro inesperado.'}
              </p>
              <button
                type="button"
                className="q-btn q-btn--primary"
                onClick={() => window.location.reload()}
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
