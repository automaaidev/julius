import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

// Encerramento automático da fila à meia-noite. O banco não tem cron: quem
// estiver com o site aberto (cliente ou painel) "empurra" a função a cada
// minuto. Ela é idempotente — no máx. 1 execução efetiva por dia — então
// vários navegadores chamando ao mesmo tempo não atrapalha.
export function useEncerramento(ativo) {
  useEffect(() => {
    if (!ativo) return
    let parar = false

    async function tick() {
      if (parar) return
      try {
        if (LOCAL) {
          await localDb.ready
          localDb.encerrarFilaVencida()
        } else if (supabase) {
          const { error } = await supabase.rpc('encerrar_fila_vencida')
          // migration ainda não rodou: não adianta insistir
          if (error && /could not find the function|schema cache/i.test(error.message)) parar = true
        }
      } catch {
        /* sem rede agora — tenta de novo no próximo minuto */
      }
    }

    tick()
    const t = setInterval(tick, 60_000)
    return () => {
      parar = true
      clearInterval(t)
    }
  }, [ativo])
}
