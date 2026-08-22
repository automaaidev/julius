import { Link } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings'
import { IconMic, IconHash, IconQueue, IconPin, IconPhone, IconInstagram } from './icons'
import './home.css'

const DIAS = [
  ['seg', 'Segunda'],
  ['ter', 'Terça'],
  ['qua', 'Quarta'],
  ['qui', 'Quinta'],
  ['sex', 'Sexta'],
  ['sab', 'Sábado'],
  ['dom', 'Domingo'],
]

const EQ_BARS = [
  { h: 18, d: 0.7, delay: 0 },
  { h: 30, d: 0.9, delay: 0.1 },
  { h: 22, d: 0.6, delay: 0.05 },
  { h: 34, d: 1.0, delay: 0.2 },
  { h: 26, d: 0.75, delay: 0.15 },
  { h: 32, d: 0.85, delay: 0.05 },
  { h: 20, d: 0.65, delay: 0.25 },
]

const NOTES = [
  { char: '♪', left: '6%', size: '1.6rem', duration: 9, delay: 0 },
  { char: '♫', left: '18%', size: '2.1rem', duration: 12, delay: 2 },
  { char: '♬', left: '32%', size: '1.3rem', duration: 8, delay: 4 },
  { char: '♪', left: '48%', size: '1.9rem', duration: 11, delay: 1 },
  { char: '♫', left: '63%', size: '1.4rem', duration: 9.5, delay: 3 },
  { char: '♪', left: '77%', size: '2.2rem', duration: 13, delay: 5 },
  { char: '♬', left: '90%', size: '1.5rem', duration: 10, delay: 2.5 },
]

const STEPS = [
  {
    icon: IconHash,
    title: 'Escolha seu número',
    desc: 'Cada música tem um número. Pega o seu e já garante a sua vez no palco.',
  },
  {
    icon: IconQueue,
    title: 'Entre na fila',
    desc: 'Nome, telefone e pronto — sem cadastro, sem senha. Acompanhe sua posição ao vivo.',
  },
  {
    icon: IconMic,
    title: 'Suba ao palco',
    desc: 'Quando chegar sua vez, o telão avisa. É só pegar o microfone e mandar ver.',
  },
]

export default function Home() {
  const { settings, loading } = useSettings()
  const aberto = settings?.status_aberto

  return (
    <div>
      <section className="hero">
        <div className="hero__spotlight" />
        <div className="hero__stripes" />
        <div className="hero__notes">
          {NOTES.map((n, i) => (
            <span
              key={i}
              style={{
                left: n.left,
                fontSize: n.size,
                animationDuration: `${n.duration}s`,
                animationDelay: `${n.delay}s`,
              }}
            >
              {n.char}
            </span>
          ))}
        </div>

        <div className="hero__eq" aria-hidden="true">
          {EQ_BARS.map((b, i) => (
            <span
              key={i}
              style={{ height: b.h, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }}
            />
          ))}
        </div>

        <h1 className="hero__logo">JULIU'S</h1>
        <p className="hero__subtitle">O VIDEOKÊ DA CIDADE</p>

        {loading ? (
          <p>Carregando status...</p>
        ) : aberto ? (
          <>
            <span className="status-pill status-pill--aberto">
              <span className="status-dot" /> ABERTO AGORA
            </span>
            <div>
              <Link to="/minha-fila" className="cta-primary">
                <IconMic width={20} height={20} /> Entrar na fila
              </Link>
            </div>
            <p style={{ marginTop: '1.2rem' }}>
              <Link to="/minha-fila" style={{ color: 'var(--pessego-escuro)' }}>
                Já entrou? Consulte sua posição
              </Link>
            </p>
          </>
        ) : (
          <>
            <span className="status-pill status-pill--fechado">
              <span className="status-dot" /> FECHADO
            </span>
            <p className="hero__note">
              Fora do horário agora — <a href="#horario">confira quando abrimos</a>
            </p>
            <p style={{ marginTop: '0.4rem' }}>
              <Link to="/minha-fila" style={{ color: 'var(--pessego-escuro)' }}>
                Já entrou na fila? Consulte sua posição
              </Link>
            </p>
          </>
        )}

        <div className="scroll-hint" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              ESCOLHA SEU NÚMERO ♪ ENTRE NA FILA ♪ SUBA AO PALCO ♪ CANTE COMO NUNCA ♪ O VIDEOKÊ DA CIDADE ♪
            </span>
          ))}
        </div>
      </div>

      <section className="section" id="horario" style={{ paddingBottom: '2.5rem' }}>
        <h2 className="section__title">Horário de funcionamento</h2>
        <div className="horario-card">
          <div className="horario-card__head">
            <span className={`status-pill ${aberto ? 'status-pill--aberto' : 'status-pill--fechado'}`}>
              <span className="status-dot" /> {aberto ? 'ABERTO AGORA' : 'FECHADO AGORA'}
            </span>
          </div>
          <ul className="horario-list">
            {DIAS.map(([key, label]) => (
              <li key={key}>
                <span>{label}</span>
                <span>{settings?.horario_funcionamento?.[key] || 'fechado'}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section__title">Como funciona</h2>
        <div className="steps">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.title} className="step-card" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="step-card__number">{i + 1}</div>
                <div className="step-card__icon">
                  <Icon />
                </div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section__title">Onde estamos</h2>
        <div className="info-grid">
          <div className="info-card">
            <div className="info-card__icon"><IconPin /></div>
            <div>
              <strong>Endereço</strong>
              Rua Exemplo, 123 — Centro
            </div>
          </div>
          <div className="info-card">
            <div className="info-card__icon"><IconPhone /></div>
            <div>
              <strong>Telefone</strong>
              (00) 00000-0000
            </div>
          </div>
          <div className="info-card">
            <div className="info-card__icon"><IconInstagram /></div>
            <div>
              <strong>Instagram</strong>
              @juliusvideoke
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
