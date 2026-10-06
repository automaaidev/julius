import { useEffect, useRef } from 'react'
import { LOCAL } from '../lib/flags'

// Mantém a tela em dia sem F5. O tempo real (WebSocket) avisa na hora, mas no celular ele
// morre em silêncio: a tela bloqueia, o sinal cai, a aba vai pro fundo — e quando a pessoa
// volta ninguém repôs o que ela perdeu. Este hook é a rede de segurança por cima dele:
//   * ao voltar pra aba / pro app / quando a internet volta: busca na hora;
//   * enquanto a aba está aberta: busca a cada `intervaloMs` (e a cada `rapidoMs` se o tempo
//     real não estiver conectado, pra o atraso ser pequeno mesmo sem ele).
// No modo local (SQLite) o próprio banco já avisa as mudanças, então não faz nada.
export function useAoVivo(refetch, { intervaloMs = 30_000, rapidoMs = 8_000, realtimeOk = true, ativo = true } = {}) {
  const ref = useRef(refetch)
  useEffect(() => {
    ref.current = refetch
  }, [refetch])

  useEffect(() => {
    if (LOCAL || !ativo) return
    let ultima = 0
    const buscar = () => {
      if (document.visibilityState !== 'visible') return
      const agora = Date.now()
      if (agora - ultima < 1000) return // voltar pra aba dispara vários eventos juntos
      ultima = agora
      ref.current()
    }
    const t = setInterval(buscar, realtimeOk ? intervaloMs : rapidoMs)
    document.addEventListener('visibilitychange', buscar)
    window.addEventListener('focus', buscar)
    window.addEventListener('online', buscar)
    window.addEventListener('pageshow', buscar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', buscar)
      window.removeEventListener('focus', buscar)
      window.removeEventListener('online', buscar)
      window.removeEventListener('pageshow', buscar)
    }
  }, [intervaloMs, rapidoMs, realtimeOk, ativo])
}

// callback do `.subscribe(...)` de um canal: diz ao hook se o tempo real está conectado e,
// quando ele RECONECTA depois de cair, busca de novo (o que chegou enquanto estava fora
// não é reenviado pelo Supabase).
export function aoStatus(setOk, aoReconectar) {
  let jaConectou = false
  return (status) => {
    const ok = status === 'SUBSCRIBED'
    setOk(ok)
    if (ok) {
      if (jaConectou) aoReconectar()
      jaConectou = true
    }
  }
}
