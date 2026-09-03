import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

// Sem .env e sem modo local: site institucional roda sem status ao vivo.
const MOCK_SETTINGS = {
  abertura_modo: 'auto',
  horario_funcionamento: {
    qui: '19:00-23:00',
    sex: '19:00-01:00',
    sab: '19:00-01:00',
    dom: '18:00-23:00',
  },
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    if (LOCAL) return localDb.getSettings()
    return supabase ? null : MOCK_SETTINGS
  })
  const [loading, setLoading] = useState(!LOCAL && Boolean(supabase))

  useEffect(() => {
    if (LOCAL) {
      const sync = () => setSettings(localDb.getSettings())
      sync()
      return localDb.subscribe(sync)
    }

    if (!supabase) return // sem .env configurado ainda

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
        { event: 'UPDATE', schema: 'julius', table: 'settings', filter: 'id=eq.1' },
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
