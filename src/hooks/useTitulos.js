import { useEffect, useState } from 'react'
import { aoMudarCatalogo, obterMusicas } from '../lib/catalogo'
import { useAoVivo } from './useAoVivo'

// Título e cantor de uma lista de números (os da fila, por exemplo).
// Devolve Map numero -> { titulo, artista } | null; enquanto carrega (ou sem
// catálogo) o Map vem vazio e a tela mostra só o número.
export function useTitulos(numeros) {
  const chave = [...new Set(numeros.filter(Boolean))].sort().join(',')
  const [mapa, setMapa] = useState(() => new Map())
  const [versao, setVersao] = useState(0)

  useEffect(() => aoMudarCatalogo(() => setVersao((v) => v + 1)), [])

  // o cache dos nomes expira em poucos minutos: busca de novo pra pegar o que o operador editou
  useAoVivo(() => setVersao((v) => v + 1), { intervaloMs: 180_000 })

  useEffect(() => {
    if (!chave) {
      setMapa((atual) => (atual.size === 0 ? atual : new Map()))
      return
    }
    let vivo = true
    obterMusicas(chave.split(',')).then((m) => {
      if (vivo) setMapa(m)
    })
    return () => {
      vivo = false
    }
  }, [chave, versao])

  return mapa
}
