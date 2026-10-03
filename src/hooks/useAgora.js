import { useEffect, useState } from 'react'

// "Agora" que re-renderiza sozinho — o aberto/fechado vira na hora certa sem
// precisar recarregar a página.
export function useAgora(intervaloMs = 30_000) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), intervaloMs)
    return () => clearInterval(t)
  }, [intervaloMs])
  return agora
}
