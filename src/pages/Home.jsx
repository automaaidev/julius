import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  useMotionValueEvent,
} from 'framer-motion'
import {
  Mic2,
  Hash,
  ListOrdered,
  ListMusic,
  MonitorPlay,
  Radio,
  PartyPopper,
  CalendarDays,
  BadgeCheck,
  MapPin,
  Phone,
  ChevronDown,
  Music2,
  ArrowRight,
  ImageIcon,
} from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { chaveDoDia, proximaAbertura } from '../lib/schedule'
import { IconInstagram } from './icons'
import './home.css'

// TODO: trocar pelos dados reais da casa
const INSTAGRAM = 'juliusvideoke'
const ENDERECO = 'Rua Exemplo, 123 — Centro'
const TELEFONE = '(00) 00000-0000'

const DIAS = [
  ['seg', 'segunda'],
  ['ter', 'terça'],
  ['qua', 'quarta'],
  ['qui', 'quinta'],
  ['sex', 'sexta'],
  ['sab', 'sábado'],
  ['dom', 'domingo'],
]

const EQ_BARS = [
  { h: 20, d: 0.7, delay: 0 },
  { h: 34, d: 0.9, delay: 0.1 },
  { h: 24, d: 0.6, delay: 0.05 },
  { h: 40, d: 1.0, delay: 0.2 },
  { h: 28, d: 0.75, delay: 0.15 },
  { h: 38, d: 0.85, delay: 0.05 },
  { h: 22, d: 0.65, delay: 0.25 },
  { h: 32, d: 0.8, delay: 0.12 },
  { h: 26, d: 0.7, delay: 0.18 },
]

// notas flutuantes desenhadas com ícone (lucide), não emoji
const NOTES = [
  { left: '7%', size: 26, duration: 9, delay: 0 },
  { left: '20%', size: 34, duration: 12, delay: 2 },
  { left: '34%', size: 20, duration: 8, delay: 4 },
  { left: '49%', size: 30, duration: 11, delay: 1 },
  { left: '63%', size: 22, duration: 9.5, delay: 3 },
  { left: '78%', size: 36, duration: 13, delay: 5 },
  { left: '91%', size: 24, duration: 10, delay: 2.5 },
]

// luzes do letreiro (marquee de lâmpadas)
const BULBS = Array.from({ length: 28 })

const STEPS = [
  {
    icon: Hash,
    title: 'Escolha seu número',
    desc: 'Cada música tem um número no catálogo. Pega o seu e já garante a vez no palco.',
  },
  {
    icon: ListOrdered,
    title: 'Entre na fila',
    desc: 'Só o seu nome (ou o da dupla) e pronto — sem cadastro, sem senha. Acompanhe a posição ao vivo.',
  },
  {
    icon: Mic2,
    title: 'Suba ao palco',
    desc: 'Quando chegar sua vez, o telão avisa. Só pegar o microfone e mandar ver.',
  },
]

const MARQUEE = 'Escolha seu número  •  Entre na fila  •  Suba ao palco  •  Cante como nunca  •  O videokê da cidade  •  '

// TODO: ajustar textos com a história/estrutura reais da casa
const SOBRE = [
  'O Juliu’s nasceu pra quem ama música e não tem vergonha do microfone. Palco, telão, som que aguenta o refrão inteiro e um catálogo que vai do sertanejo ao rock, do k-pop ao pagode.',
  'Aniversário, treta de amigos ou só uma noite qualquer — aqui a fila é justa, todo mundo acompanha a própria vez pelo celular e ninguém fura. É só chegar, escolher o número e esperar o telão chamar.',
]

const SOBRE_TAGS = [
  { icon: Mic2, label: 'Karaokê livre' },
  { icon: CalendarDays, label: 'Toda semana' },
  { icon: BadgeCheck, label: 'Sem taxa pra cantar' },
]

// "Benefícios" no site de referência — aqui vira "por que o Juliu's"
const DIFERENCIAIS = [
  { icon: MonitorPlay, title: 'Palco + telão', desc: 'Microfones de sobra, telão grande e a letra na cara pra ninguém se perder.' },
  { icon: ListMusic, title: 'Catálogo gigante', desc: 'Do clássico ao lançamento. Se tá tocando na rua, provavelmente tá aqui.' },
  { icon: Radio, title: 'Fila ao vivo', desc: 'Acompanhe sua posição pelo celular. Sem papelzinho, sem furão, sem estresse.' },
  { icon: PartyPopper, title: 'Rolê garantido', desc: 'Vem sozinho, com a treta ou com a firma toda. Sempre tem lugar pra cantar.' },
]

// TODO: fotos reais em /public/galeria — troque os tiles por <img> quando tiver
const GALERIA = [
  { label: 'Palco principal', wide: true },
  { label: 'Plateia' },
  { label: 'Aniversário' },
  { label: 'Camarote' },
  { label: 'Telão', wide: true },
  { label: 'Bar' },
]

// TODO: confirmar respostas marcadas com [confirmar]
const FAQ = [
  { q: 'Precisa pagar pra cantar?', a: 'Não. Cantar é de graça, sempre. Você consome o que quiser no bar, mas o microfone é livre.' },
  { q: 'Como eu entro na fila?', a: 'Pelo site: seu nome (ou o da dupla) e o número da música no catálogo. Dá pra entrar da própria mesa e acompanhar a posição em tempo real.' },
  { q: 'Posso emendar duas músicas seguidas?', a: 'Cada pessoa pode ter até 2 músicas ativas na fila. Se tiver mais gente esperando, a sua segunda música pula uma posição — pra todo mundo cantar.' },
  { q: 'Como faço uma reserva de aniversário?', a: 'Chama no Instagram ou liga. A gente separa a mesa e combina os detalhes. [confirmar]' },
  { q: 'Tem idade mínima pra entrar?', a: 'Depende da noite e da legislação local. [confirmar]' },
  { q: 'E se a música que eu quero não estiver no catálogo?', a: 'Fala com a equipe. Às vezes rola achar uma versão na hora.' },
]

/* ---------- helpers de animação ---------- */

const revealProps = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
}

const MotionLink = motion.create(Link)

// HashRouter na app -> links de âncora (#secao) não podem navegar de verdade,
// senão quebram o roteador. preventDefault + scroll manual.
function onAnchor(e, id) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// letreiro de lâmpadas — assinatura visual da casa
function BulbStrip() {
  return (
    <div className="lp-bulbs" aria-hidden="true">
      {BULBS.map((_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 6) * 0.18}s` }} />
      ))}
    </div>
  )
}

// Botão que "puxa" o cursor — o clássico efeito magnético.
function MagneticCTA({ href, to, children }) {
  const ref = useRef(null)
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * 0.35)
    y.set((e.clientY - (r.top + r.height / 2)) * 0.35)
  }
  const reset = () => {
    x.set(0)
    y.set(0)
  }

  const inner = (
    <>
      <Mic2 size={19} strokeWidth={2.2} /> {children}
    </>
  )

  const common = {
    ref,
    className: 'cta-primary',
    style: { x, y },
    onMouseMove: onMove,
    onMouseLeave: reset,
    whileTap: { scale: 0.95 },
  }

  if (to) {
    return (
      <MotionLink {...common} to={to}>
        {inner}
      </MotionLink>
    )
  }
  const external = /^https?:/.test(href)
  const anchor = href?.startsWith('#')
  return (
    <motion.a
      {...common}
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...(anchor ? { onClick: (e) => onAnchor(e, href.slice(1)) } : {})}
    >
      {inner}
    </motion.a>
  )
}

// Galeria com lightbox — tiles decorativos até entrarem fotos reais.
function Galeria() {
  const [aberta, setAberta] = useState(null)
  return (
    <>
      <div className="lp-galeria">
        {GALERIA.map((g, i) => (
          <motion.button
            key={g.label}
            type="button"
            className={`lp-galeria__tile ${g.wide ? 'lp-galeria__tile--wide' : ''}`}
            onClick={() => setAberta(g)}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <ImageIcon className="lp-galeria__ph" size={30} strokeWidth={1.5} />
            <span className="lp-galeria__label">{g.label}</span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {aberta && (
          <motion.div
            className="lp-lightbox"
            onClick={() => setAberta(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="lp-lightbox__card"
              initial={{ scale: 0.82, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.82, y: 20 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            >
              <ImageIcon size={56} strokeWidth={1.3} />
              <strong>{aberta.label}</strong>
              <span className="lp-lightbox__hint">foto em breve</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// FAQ em accordion — uma resposta aberta por vez.
function Faq() {
  const [aberta, setAberta] = useState(null)
  return (
    <div className="lp-faq">
      {FAQ.map((f, i) => {
        const isOpen = aberta === i
        return (
          <div key={f.q} className={`lp-faq__item ${isOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="lp-faq__q"
              aria-expanded={isOpen}
              onClick={() => setAberta(isOpen ? null : i)}
            >
              <span>{f.q}</span>
              <motion.span
                className="lp-faq__chev"
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.25 }}
              >
                <ChevronDown size={18} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  className="lp-faq__a-wrap"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="lp-faq__a">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- page ---------- */

export default function Home() {
  const { settings, loading } = useSettings()
  const aberto = settings?.status_aberto
  const hojeKey = chaveDoDia(new Date().getDay())
  const abreEm = !aberto ? proximaAbertura(settings?.horario_funcionamento) : null

  const heroRef = useRef(null)
  const [stuck, setStuck] = useState(false)

  // progresso de scroll da página inteira -> barra no topo
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })

  // parallax do hero
  const { scrollYProgress: heroProg } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const logoY = useTransform(heroProg, [0, 1], [0, 120])
  const bgY = useTransform(heroProg, [0, 1], [0, -80])
  const heroFade = useTransform(heroProg, [0, 0.8], [1, 0])

  useMotionValueEvent(scrollYProgress, 'change', (v) => setStuck(v > 0.02))

  // feixes de luz seguem o mouse
  const onHeroMove = (e) => {
    const r = heroRef.current.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * 100
    const py = ((e.clientY - r.top) / r.height) * 100
    heroRef.current.style.setProperty('--bx', `${px}%`)
    heroRef.current.style.setProperty('--by', `${py}%`)
  }

  return (
    <div>
      <motion.div className="lp-progress" style={{ scaleX: progress }} />

      <header className={`lp-header ${stuck ? 'lp-header--stuck' : ''}`}>
        <a href="#hero" className="lp-header__brand" onClick={(e) => onAnchor(e, 'hero')}>
          <img className="lp-header__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
        </a>
        <nav className="lp-nav">
          <a href="#sobre" onClick={(e) => onAnchor(e, 'sobre')}>Sobre</a>
          <a href="#como" onClick={(e) => onAnchor(e, 'como')}>Como funciona</a>
          <a href="#horario" onClick={(e) => onAnchor(e, 'horario')}>Horário</a>
          <a href="#faq" onClick={(e) => onAnchor(e, 'faq')}>FAQ</a>
          <a href="#local" onClick={(e) => onAnchor(e, 'local')}>Local</a>
        </nav>
        <Link className="lp-header__cta" to="/minha-fila">
          Entrar na fila
        </Link>
      </header>

      <section id="hero" className="hero" ref={heroRef} onMouseMove={onHeroMove}>
        <motion.div className="hero__beams" style={{ y: bgY }} />
        <div className="hero__stripes" />
        <motion.div className="hero__vinyl-wrap" style={{ y: bgY }}>
          <div className="lp-vinyl" />
        </motion.div>

        <div className="hero__notes" aria-hidden="true">
          {NOTES.map((n, i) => (
            <span
              key={i}
              style={{
                left: n.left,
                animationDuration: `${n.duration}s`,
                animationDelay: `${n.delay}s`,
              }}
            >
              <Music2 size={n.size} strokeWidth={1.6} />
            </span>
          ))}
        </div>

        <motion.div style={{ y: logoY, opacity: heroFade }} className="hero__stack">
          <div className="lp-eq" aria-hidden="true">
            {EQ_BARS.map((b, i) => (
              <span
                key={i}
                style={{
                  height: b.h,
                  animationDuration: `${b.d}s`,
                  animationDelay: `${b.delay}s`,
                }}
              />
            ))}
          </div>

          <motion.img
            className="hero__logo"
            src="/logo-wordmark.png"
            alt="Juliu's"
            width="1048"
            height="272"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.p
            className="hero__subtitle"
            initial={{ opacity: 0, letterSpacing: '0.8em' }}
            animate={{ opacity: 1, letterSpacing: '0.42em' }}
            transition={{ duration: 0.9, delay: 0.2 }}
          >
            O videokê da cidade
          </motion.p>
        </motion.div>

        <motion.div
          className="hero__cta-block"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          {loading ? (
            <p>Carregando status…</p>
          ) : aberto ? (
            <>
              <span className="status-pill status-pill--aberto">
                <span className="status-dot" /> Aberto agora
              </span>
              <div>
                <MagneticCTA to="/minha-fila">Entrar na fila</MagneticCTA>
              </div>
              <p className="hero__hint-line">
                <Link to="/minha-fila">Já entrou? Consulte sua posição</Link>
              </p>
            </>
          ) : (
            <>
              <span className="status-pill status-pill--fechado">
                <span className="status-dot" /> Fechado
              </span>
              <div>
                <MagneticCTA href="#horario">Ver horários</MagneticCTA>
              </div>
              <p className="hero__hint-line">
                {abreEm ? abreEm.label : <a href="#horario" onClick={(e) => onAnchor(e, 'horario')}>Confira quando abrimos</a>}
              </p>
              <p>
                <Link to="/minha-fila" className="cta-ghost">
                  Já entrou na fila? Consulte sua posição
                </Link>
              </p>
            </>
          )}
        </motion.div>

        <motion.div className="lp-scroll-hint" aria-hidden="true" style={{ opacity: heroFade }}>
          <ChevronDown size={22} />
        </motion.div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <BulbStrip />
        <div className="lp-marquee__track">
          <span>{MARQUEE}</span>
          <span>{MARQUEE}</span>
        </div>
        <BulbStrip />
      </div>

      <motion.section id="sobre" className="lp-section lp-sobre" {...revealProps}>
        <div className="lp-sobre__grid">
          <motion.div
            className="lp-sobre__media"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lp-sobre__frame">
              <div className="lp-sobre__frame-inner">
                <Mic2 size={42} strokeWidth={1.4} />
                <strong>Palco lotado toda semana</strong>
                <span>foto em breve</span>
              </div>
            </div>
          </motion.div>
          <div>
            <span className="lp-section__kicker lp-section__kicker--left">Sobre</span>
            <h2 className="lp-section__title lp-section__title--left">Sobre o Juliu&apos;s</h2>
            {SOBRE.map((p) => (
              <p key={p.slice(0, 24)} className="lp-sobre__p">{p}</p>
            ))}
            <div className="lp-sobre__tags">
              {SOBRE_TAGS.map(({ icon: Icon, label }) => (
                <span key={label}><Icon size={15} strokeWidth={2} /> {label}</span>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section id="como" className="lp-section" {...revealProps}>
        <span className="lp-section__kicker">Simples assim</span>
        <h2 className="lp-section__title">Como funciona</h2>
        <div className="lp-steps">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.title}
                className="lp-step lp-ticket"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                whileHover={{ y: -8 }}
              >
                <div className="lp-step__num">{String(i + 1).padStart(2, '0')}</div>
                <div className="lp-step__icon"><Icon size={30} strokeWidth={1.7} /></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </motion.section>

      <motion.section id="horario" className="lp-section" {...revealProps}>
        <span className="lp-section__kicker">Toda semana</span>
        <h2 className="lp-section__title">Horário de funcionamento</h2>
        <div className="lp-horario lp-ticket">
          <div className="lp-horario__head">
            <span className={`status-pill ${aberto ? 'status-pill--aberto' : 'status-pill--fechado'}`}>
              <span className="status-dot" /> {aberto ? 'Aberto agora' : 'Fechado agora'}
            </span>
          </div>
          <ul>
            {DIAS.map(([key, label]) => (
              <li key={key} className={key === hojeKey ? 'li--hoje' : undefined}>
                <span>{label}{key === hojeKey ? ' · hoje' : ''}</span>
                <span>{settings?.horario_funcionamento?.[key] || 'fechado'}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      <section className="lp-section lp-section--dark">
        <div className="lp-difs">
          <motion.div className="lp-difs__intro" {...revealProps}>
            <span className="lp-section__kicker lp-section__kicker--left">Por que aqui</span>
            <h2 className="lp-section__title lp-section__title--left">O que rola no Juliu&apos;s</h2>
            <p>Um lugar feito pra cantar — não pra assistir. Estrutura de casa de show, preço de bar de bairro.</p>
            <Link to="/minha-fila" className="lp-difs__link">
              Entrar na fila <ArrowRight size={16} />
            </Link>
          </motion.div>
          <div className="lp-difs__grid">
            {DIFERENCIAIS.map((d, i) => {
              const Icon = d.icon
              return (
                <motion.div
                  key={d.title}
                  className="lp-dif"
                  initial={{ opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  whileHover={{ y: -6 }}
                >
                  <span className="lp-dif__icon"><Icon size={24} strokeWidth={1.8} /></span>
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      <motion.section id="galeria" className="lp-section" {...revealProps}>
        <span className="lp-section__kicker">A noite por aqui</span>
        <h2 className="lp-section__title">Galeria</h2>
        <Galeria />
      </motion.section>

      <motion.section id="faq" className="lp-section lp-section--narrow" {...revealProps}>
        <span className="lp-section__kicker lp-section__kicker--left">Dúvidas</span>
        <h2 className="lp-section__title lp-section__title--left">Perguntas frequentes</h2>
        <Faq />
      </motion.section>

      <motion.section id="local" className="lp-section lp-section--local" {...revealProps}>
        <span className="lp-section__kicker">Vem cantar</span>
        <h2 className="lp-section__title">Onde estamos</h2>
        <div className="lp-info-grid">
          <div className="lp-info">
            <div className="lp-info__icon"><MapPin size={22} strokeWidth={1.8} /></div>
            <div><strong>Endereço</strong>{ENDERECO}</div>
          </div>
          <div className="lp-info">
            <div className="lp-info__icon"><Phone size={22} strokeWidth={1.8} /></div>
            <div><strong>Telefone</strong>{TELEFONE}</div>
          </div>
          <a
            className="lp-info"
            href={`https://instagram.com/${INSTAGRAM}`}
            target="_blank"
            rel="noreferrer"
          >
            <div className="lp-info__icon"><IconInstagram width={22} height={22} /></div>
            <div><strong>Instagram</strong>@{INSTAGRAM}</div>
          </a>
        </div>
        <MagneticCTA to="/minha-fila">Entrar na fila</MagneticCTA>
      </motion.section>

      <footer className="lp-footer">
        <span className="lp-footer__brand">
          <img className="lp-footer__logo" src="/logo-wordmark.png" alt="Juliu's" width="1048" height="272" />
        </span>
        O videokê da cidade · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
