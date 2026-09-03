import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOCAL } from '../lib/flags'
import { localDb } from '../lib/localDb'

export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = ainda carregando

  useEffect(() => {
    if (LOCAL) {
      setSession(localDb.auth.getSession())
      return localDb.auth.subscribe((s) => setSession(s))
    }

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
    signIn: (email, password) =>
      LOCAL
        ? Promise.resolve({ data: { session: localDb.auth.signIn(email) }, error: null })
        : supabase?.auth.signInWithPassword({ email, password }),
    signOut: () => (LOCAL ? localDb.auth.signOut() : supabase?.auth.signOut()),
  }
}
