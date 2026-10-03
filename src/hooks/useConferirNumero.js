import { useEffect, useState } from 'react'
import { conferirNumero } from '../lib/catalogo'

// os códigos do cardápio têm 4 ou 5 dígitos: antes disso a pessoa ainda está digitando
const MIN_DIGITOS = 4
const ESPERA_MS = 250

// Confere o número que está sendo digitado contra o cardápio.
// estado: null (nada a mostrar) | 'existe' | 'nao' | 'desconhecido'
export function useConferirNumero(numero) {
  const [resultado, setResultado] = useState({ para: '', estado: null, musica: null })

  useEffect(() => {
    if (numero.length < MIN_DIGITOS) return
    let vivo = true
    const t = setTimeout(async () => {
      const r = await conferirNumero(numero)
      if (vivo) setResultado({ para: numero, estado: r.existe === true ? 'existe' : r.existe === false ? 'nao' : 'desconhecido', musica: r.musica ?? null })
    }, ESPERA_MS)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [numero])

  // resultado de outro número (ainda conferindo) não vale
  return resultado.para === numero && numero.length >= MIN_DIGITOS ? resultado : { estado: null, musica: null }
}
