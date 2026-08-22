import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Sem .env configurado ainda: mock local pra dar pra testar a tela "aberto"
// antes de existir um projeto Supabase de verdade. Some assim que .env existir.
const MOCK_SETTINGS = {
  status_aberto: true,
  horario_funcionamento: {
    qui: '19:00-23:00',
    sex: '19:00-01:00',
    sab: '19:00-01:00',
    dom: '18:00-23:00',
  },
}

export function useSettings() {
  const [settings, setSettings] = useState(supabase ? null : MOCK_SETTINGS)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return // sem .env configurado ainda — site institucional roda sem status ao vivo

    let active = true

    supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (active) {
          setSettings(data)
          setLoading(false)
        }
      })

    const channel = supabase
      .channel('settings-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'id=eq.1' },
        (payload) => setSettings(payload.new)
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { settings, loading }
}
