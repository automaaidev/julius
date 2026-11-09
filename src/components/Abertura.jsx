import { useEffect, useRef } from 'react'
import './abertura.css'

/**
 * Abertura "boot de app" da tela de entrada — o mesmo esquema do loader do site da Automaí, com a
 * logo do Juliu's: uma fiação de luz desenha as letras, a logo acende, o slogan entra e a logo voa
 * até o lugar dela no formulário.
 *
 * Linha do tempo (≈2,8s; tudo ajustável em T e SEQ):
 *  A. fiação  traços dourados desenham o esqueleto das letras e as "lâmpadas" acendem quando a caneta
 *             passa. O desenho segue a carga REAL (logo e fontes), com um ritmo mínimo pra dar tempo de ver.
 *  B. acende  as letras nascem dos traços (uma máscara de traços que engrossam revela a logo de verdade);
 *             clarão, anel e faíscas.
 *  C. logo    a logo "respira", o "videokê da cidade" entra letra a letra e um brilho cruza o nome.
 *  D. voo     a logo encolhe e voa até `alvoRef` (a logo do formulário); o fundo some.
 *
 * Contrato com a página: `alvoRef` aponta pra uma <img> da mesma logo (mesma proporção), já no lugar
 * final e invisível; `onVoo` roda quando a logo começa a voar (hora de mostrar o formulário) e `onFim`
 * quando ela pousa (hora de mostrar a <img> e tirar a abertura).
 *
 * Toque, tecla ou "Pular" adianta. Movimento reduzido: logo parada por um instante.
 * Sem lib de animação: Web Animations API + CSS. Câmera lenta pra revisar: /?abertura=0.25#/entrar
 */

const LOGO = { src: '/logo-lockup.png', w: 1066, h: 419 }
const NOME_H = 300 // faixa do "JULIU'S" na imagem (embaixo dela fica o slogan)
const CENTRO = { x: 533, y: 147 } // centro do nome: clarão, anel e faíscas saem daqui

/*
 * Esqueleto das letras (linha central de cada traço) em coordenadas da imagem. Se a logo mudar,
 * refazer estes traços. Ordem = ordem em que a "caneta" desenha. Todo traço termina num par x y
 * (as lâmpadas vão nas pontas).
 */
const TRACOS = [
  'M34 36.5L130 36.5', // J: barra de cima
  'M105.5 105V199Q105.5 255 50 255L15 255', // J
  'M161.5 61V179A75 75 0 0 0 311.5 179L311.5 14', // U
  'M372 14L372 179', // L: haste
  'M347 255L493 255', // L: base
  'M558 14L558 256', // I
  'M502 256L613 256', // I: base
  'M644.5 61V179A74.5 74.5 0 0 0 793.5 179L793.5 14', // U
  'M867 43L843.5 123', // '
  'M1026 91C1026 54 1000 37 968 37C936 37 911 59 911 92C911 124 935 142 968 146C1000 150 1026 164 1026 202C1026 234 1005 255 972 255', // S
]
const pontas = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number)
  return [
    [n[0], n[1]],
    [n[n.length - 2], n[n.length - 1]],
  ]
}
const LAMPADAS = TRACOS.flatMap((d, i) => pontas(d).map(([x, y], j) => ({ id: `${i}-${j}`, x, y })))

/** "O VIDEOKÊ DA CIDADE": [x0, x1] de cada letra na imagem. */
const SLOGAN = [
  [127, 168], [206, 242], [259, 263], [285, 319], [339, 363], [380, 422], [441, 472], [490, 515],
  [558, 592], [606, 643], [682, 721], [741, 745], [767, 801], [816, 853], [870, 904], [923, 948],
]

/** Tempos em ms. */
const T = {
  tracoMin: 900, // o desenho nunca dura menos que isso, mesmo com tudo em cache
  tracoMax: 1600, // teto: passou disso, força 100% em vez de esperar rede lenta
  sobrepoe: 0.35, // quanto os traços se sobrepõem (cascata da esquerda pra direita)
  segura: 180, // a logo pronta fica parada um instante antes de voar
  voo: 560,
  vooRapido: 200,
  estatico: 450,
}

/** Fases B e C: [início, duração] em ms a partir do instante em que o desenho chega a 100%. */
const SEQ = {
  cresce: [0, 300], // traços da máscara engrossam: as letras nascem das linhas
  lampadasSomem: [40, 240],
  fiacaoSome: [300, 160],
  inteiro: [260, 180], // a logo sem máscara por cima (bordas limpas)
  clarao: [0, 700],
  anel: [120, 700],
  faiscas: [120, 820],
  respiro: [0, 560],
  letras: [380, 260], // + letraEscalonada por letra
  letraEscalonada: 32,
  brilho: [720, 480],
}
const CRESCE_ATE = 74 // espessura final dos traços da máscara: cobre a letra mais grossa

const EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.7, 0, 0.2, 1)',
  back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  voo: 'cubic-bezier(0.22, 1, 0.36, 1)',
}

// Faíscas: ângulo áureo espalha sem repetir direção (determinístico, sem Math.random).
const FAISCAS = Array.from({ length: 18 }, (_, i) => {
  const ang = i * 2.39996 + 0.4
  const alcance = 170 + ((i * 53) % 130)
  return { dx: Math.cos(ang) * alcance * 1.5, dy: Math.sin(ang) * alcance * 0.8, r: 5 + ((i * 7) % 5) * 1.2, ouro: i % 3 !== 0 }
})

const facilitaSenoide = (x) => 0.5 - Math.cos(Math.PI * x) / 2

export default function Abertura({ alvoRef, onVoo, onFim }) {
  const raizRef = useRef(null)
  const cbRef = useRef({ onVoo, onFim })
  useEffect(() => {
    cbRef.current = { onVoo, onFim }
  }, [onVoo, onFim])

  useEffect(() => {
    const raiz = raizRef.current
    if (!raiz) return
    const $ = (sel) => raiz.querySelector(sel)
    const $$ = (sel) => Array.from(raiz.querySelectorAll(sel))
    const svg = $('.abertura__logo')
    const params = new URLSearchParams(window.location.search)
    const VEL = Math.min(4, Math.max(0.05, Number(params.get('abertura')) || 1))
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let fase = 'traco' // traco -> monta -> voo -> fim (ou estatico)
    let raf = 0
    let acabou = false
    let voou = false
    const anims = [] // fases B e C
    const voando = [] // fase D
    const timers = []

    function rodar(lista, el, quadros, atraso, duracao, easing) {
      const a = el.animate(quadros, { delay: atraso, duration: duracao, easing, fill: 'both' })
      a.playbackRate = VEL
      lista.push(a)
      return a
    }
    const tocar = (el, quadros, [em, dur], easing) => el && rodar(anims, el, quadros, em, dur, easing)

    function avisarVoo() {
      if (voou) return
      voou = true
      cbRef.current.onVoo?.()
    }

    function fim() {
      if (acabou) return
      acabou = true
      fase = 'fim'
      cancelAnimationFrame(raf)
      avisarVoo()
      cbRef.current.onFim?.()
    }

    // faixa [s, e] de cada traço no progresso, proporcional ao comprimento (caneta em velocidade constante)
    const tracos = $$('.abertura__traco')
    const comprimentos = tracos.map((p) => p.getTotalLength())
    const total = comprimentos.reduce((a, b) => a + b, 0)
    let acc = 0
    tracos.forEach((p, i) => {
      const s = (acc / total) * (1 - T.sobrepoe)
      acc += comprimentos[i]
      const e = (acc / total) * (1 - T.sobrepoe) + T.sobrepoe
      p.style.setProperty('--s', s.toFixed(4))
      p.style.setProperty('--e', e.toFixed(4))
      // cada lâmpada acende quando a caneta chega nela (a do fim, um pouco antes de 100%)
      $$(`[data-traco="${i}-0"]`).forEach((l) => l.style.setProperty('--at', s.toFixed(4)))
      $$(`[data-traco="${i}-1"]`).forEach((l) => l.style.setProperty('--at', Math.min(e, 0.93).toFixed(4)))
    })

    /** Fase A: a fiação desenha. Progresso = o menor entre a carga REAL e o ritmo mínimo. */
    function comecarTraco() {
      const img = new Image()
      img.src = LOGO.src
      const tarefas = [
        img.decode().catch(() => {}),
        document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve(),
      ]
      let prontas = 0
      tarefas.forEach((t) => t.then(() => prontas++))

      const inicio = performance.now()
      let ultimo = inicio
      let real = 0
      const tick = (agora) => {
        const t = (agora - inicio) * VEL
        const dt = (agora - ultimo) * VEL
        ultimo = agora
        const alvo = t >= T.tracoMax ? 1 : prontas / tarefas.length
        const tau = t > T.tracoMax - 200 ? 40 : 110
        real += (alvo - real) * (1 - Math.exp(-dt / tau))
        const p = Math.min(real, facilitaSenoide(Math.min(1, t / T.tracoMin)))
        raiz.style.setProperty('--p', p.toFixed(4))

        const carregou = prontas === tarefas.length && real > 0.985 && t >= T.tracoMin
        if (carregou || t >= T.tracoMax + 60) {
          raiz.style.setProperty('--p', '1')
          montar()
        } else {
          raf = requestAnimationFrame(tick)
        }
      }
      raf = requestAnimationFrame(tick)
    }

    /** Fases B e C: as letras nascem da fiação, a logo acende e o slogan entra. */
    async function montar() {
      fase = 'monta'
      $$('.abertura__cresce').forEach((el) =>
        tocar(el, [{ strokeWidth: '0px' }, { strokeWidth: `${CRESCE_ATE}px` }], SEQ.cresce, EASE.out)
      )
      $$('.abertura__lampada, .abertura__halo').forEach((el) =>
        tocar(el, [{ opacity: 1 }, { opacity: 0 }], SEQ.lampadasSomem, 'ease-out')
      )
      tocar($('.abertura__fiacao'), [{ opacity: 1 }, { opacity: 0 }], SEQ.fiacaoSome, 'linear')
      tocar($('.abertura__inteiro'), [{ opacity: 0 }, { opacity: 1 }], SEQ.inteiro, 'ease-in-out')

      // energia: clarão no fundo, anel que se abre e faíscas
      tocar($('.abertura__clarao'), [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], SEQ.clarao, 'ease-out')
      tocar(
        $('.abertura__anel'),
        [
          { opacity: 0, transform: 'scale(1)' },
          { opacity: 0.9, offset: 0.12 },
          { opacity: 0, transform: 'scale(7)' },
        ],
        SEQ.anel,
        EASE.out
      )
      $$('.abertura__faisca').forEach((el, i) =>
        tocar(
          el,
          [
            { opacity: 0, transform: 'translate(0px, 0px) scale(1)' },
            { opacity: 1, offset: 0.1 },
            { opacity: 0, transform: `translate(${FAISCAS[i].dx}px, ${FAISCAS[i].dy}px) scale(0.3)` },
          ],
          SEQ.faiscas,
          EASE.out
        )
      )

      // a logo "respira", o slogan entra letra a letra e um brilho cruza o nome
      tocar(
        $('.abertura__palco'),
        [{ transform: 'scale(0.97)' }, { transform: 'scale(1.035)', offset: 0.45 }, { transform: 'scale(1)' }],
        SEQ.respiro,
        EASE.out
      )
      $$('.abertura__letra').forEach((el, i) =>
        tocar(
          el,
          [
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'translateY(0px)' },
          ],
          [SEQ.letras[0] + i * SEQ.letraEscalonada, SEQ.letras[1]],
          EASE.back
        )
      )
      tocar($('.abertura__brilho'), [{ transform: 'translateX(0px)' }, { transform: 'translateX(1400px)' }], SEQ.brilho, 'ease-in-out')

      await Promise.allSettled(anims.map((a) => a.finished))
      if (acabou || fase !== 'monta') return
      timers.push(setTimeout(() => fase === 'monta' && voar(T.voo), T.segura / VEL))
    }

    /** Fase D: a logo encolhe e voa até a logo do formulário; o fundo some. */
    async function voar(duracao) {
      if (acabou) return
      fase = 'voo'
      avisarVoo()
      const alvo = alvoRef?.current?.getBoundingClientRect()
      if (svg && alvo && alvo.width > 0) {
        const de = svg.getBoundingClientRect()
        const escala = alvo.width / de.width
        const voo = rodar(
          voando,
          svg,
          [
            { transform: 'translate(0px, 0px) scale(1)' },
            { transform: `translate(${alvo.left - de.left}px, ${alvo.top - de.top}px) scale(${escala})` },
          ],
          0,
          duracao,
          EASE.voo
        )
        // pousou: a abertura para de segurar os toques enquanto o fundo termina de sumir
        voo.finished.then(() => (raiz.style.pointerEvents = 'none')).catch(() => {})
      }
      rodar(voando, $('.abertura__fundo'), [{ opacity: 1 }, { opacity: 0 }], 0, duracao, 'ease-out')
      rodar(voando, $('.abertura__pular'), [{ opacity: 1 }, { opacity: 0 }], 0, duracao / 2, 'linear')
      await Promise.allSettled(voando.map((a) => a.finished))
      fim()
    }

    /** Pulo durante a fiação: a logo nem apareceu, então só dissolve a abertura. */
    function saidaRapida() {
      fase = 'voo'
      avisarVoo()
      rodar(voando, raiz, [{ opacity: 1 }, { opacity: 0 }], 0, 160, 'ease-out').finished.then(fim, fim)
    }

    function pular() {
      if (acabou) return
      cancelAnimationFrame(raf)
      if (fase === 'estatico') return fim()
      if (fase === 'voo') return voando.forEach((a) => a.finish()) // já voando: pousa na hora
      if (fase === 'monta') {
        anims.forEach((a) => a.finish())
        return voar(T.vooRapido)
      }
      saidaRapida()
    }
    function tecla(e) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return
      pular()
    }

    raiz.addEventListener('pointerdown', pular)
    window.addEventListener('keydown', tecla)
    if (reduzido) {
      // movimento reduzido: só a logo parada por um instante
      fase = 'estatico'
      timers.push(setTimeout(fim, T.estatico))
    } else {
      comecarTraco()
    }

    return () => {
      acabou = true
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      ;[...anims, ...voando].forEach((a) => a.cancel())
      raiz.removeEventListener('pointerdown', pular)
      window.removeEventListener('keydown', tecla)
      raiz.style.removeProperty('pointer-events')
    }
  }, [alvoRef])

  return (
    <div ref={raizRef} className="abertura" role="status" aria-live="polite">
      <span className="abertura__sr">Abrindo o Juliu&apos;s</span>
      <div className="abertura__fundo" aria-hidden="true" />
      <div className="abertura__clarao" aria-hidden="true" />

      <svg className="abertura__logo" viewBox={`0 0 ${LOGO.w} ${LOGO.h}`} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="abertura-nome">
            <rect x="0" y="0" width={LOGO.w} height={NOME_H} />
          </clipPath>
          {/* as letras nascem da fiação: só aparecem onde um traço grosso (que cresce de 0 a CRESCE_ATE) passa */}
          <mask id="abertura-cresce" maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO.w} height={NOME_H}>
            {TRACOS.map((d) => (
              <path key={d} className="abertura__cresce" d={d} />
            ))}
          </mask>
          {/* o brilho só passa por cima das letras */}
          <mask id="abertura-forma" maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO.w} height={NOME_H} style={{ maskType: 'alpha' }}>
            <image href={LOGO.src} width={LOGO.w} height={LOGO.h} />
          </mask>
          <linearGradient id="abertura-brilho" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {SLOGAN.map(([x0, x1], i) => (
            <clipPath key={i} id={`abertura-l${i}`}>
              <rect x={x0 - 3} y="340" width={x1 - x0 + 6} height="72" />
            </clipPath>
          ))}
        </defs>

        <g className="abertura__palco">
          <image className="abertura__nascendo" href={LOGO.src} width={LOGO.w} height={LOGO.h} mask="url(#abertura-cresce)" />
          <image className="abertura__inteiro" href={LOGO.src} width={LOGO.w} height={LOGO.h} clipPath="url(#abertura-nome)" />

          <g mask="url(#abertura-forma)">
            <g transform="skewX(-18)">
              <rect className="abertura__brilho" x="-220" y="0" width="120" height={NOME_H} fill="url(#abertura-brilho)" />
            </g>
          </g>

          <g className="abertura__fiacao">
            {TRACOS.map((d) => (
              <path key={d} className="abertura__traco" d={d} pathLength="1" />
            ))}
            {LAMPADAS.map((l) => (
              <g key={l.id}>
                <circle className="abertura__halo" data-traco={l.id} cx={l.x} cy={l.y} r="22" />
                <circle className="abertura__lampada" data-traco={l.id} cx={l.x} cy={l.y} r="9" />
              </g>
            ))}
          </g>

          {SLOGAN.map((_, i) => (
            <g key={i} className="abertura__letra" clipPath={`url(#abertura-l${i})`}>
              <image href={LOGO.src} width={LOGO.w} height={LOGO.h} />
            </g>
          ))}
        </g>

        <circle className="abertura__anel" cx={CENTRO.x} cy={CENTRO.y} r="60" />
        {FAISCAS.map((f, i) => (
          <circle
            key={i}
            className={`abertura__faisca ${f.ouro ? '' : 'abertura__faisca--pessego'}`}
            cx={CENTRO.x}
            cy={CENTRO.y}
            r={f.r}
          />
        ))}
      </svg>

      <button type="button" className="abertura__pular">
        Pular
      </button>
    </div>
  )
}
