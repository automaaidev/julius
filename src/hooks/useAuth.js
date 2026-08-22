import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = ainda carregando

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return {
    session,
    loading: session === undefined,
    signIn: (email, password) => supabase?.auth.signInWithPassword({ email, password }),
    signOut: () => supabase?.auth.signOut(),
  }
}
