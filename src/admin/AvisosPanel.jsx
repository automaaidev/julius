import { useState } from 'react'
import { Megaphone, CircleHelp, MessageSquareReply, Plus, Pencil, Trash2, Check, X, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAvisos } from '../hooks/useAvisos'
import { criarAviso, atualizarAviso, excluirAviso } from '../lib/avisosCasa'
import { mapErroAdmin } from './erros'

// Aba Avisos: o banco de textos da casa. O operador escreve uma vez e o sistema responde
// por ele — a pessoa não precisa ir ao balcão perguntar.
export default function AvisosPanel() {
  return (
    <>
      <ListaAvisos
        tipo="aviso"
        Icone={Megaphone}
        titulo="Aviso da casa"
        descricao="Aparece no topo da tela de quem está com o site aberto, enquanto estiver ligado. Use pra recados do momento: “aparelho voltando em 10 min”, “última chamada de músicas”…"
        rotuloTitulo="Título curto"
        exemploTitulo="Ex.: Atenção"
        rotuloTexto="Recado"
        exemploTexto="Ex.: O aparelho volta em 10 minutos."
        textoVazio="Nenhum aviso agora. Crie um quando precisar avisar todo mundo."
        textoAdicionar="Novo aviso"
      />
      <ListaAvisos
        tipo="faq"
        Icone={CircleHelp}
        titulo="Dúvidas frequentes"
        descricao="Perguntas e respostas que o cliente abre no botão “Dúvidas” do site. Quanto mais você responder aqui, menos gente vai ao balcão."
        rotuloTitulo="Pergunta"
        exemploTitulo="Ex.: Posso cantar em dupla?"
        rotuloTexto="Resposta"
        exemploTexto="Ex.: Pode! Peça com o nome da dupla e…"
        textoVazio="Nenhuma pergunta cadastrada. O botão “Dúvidas” do cliente fica vazio."
        textoAdicionar="Nova pergunta"
      />
      <ListaAvisos
        tipo="resposta"
        Icone={MessageSquareReply}
        titulo="Respostas prontas do chat"
        descricao="Viram botões no chat de cada cliente: um toque e a mensagem vai. Só você vê estes textos."
        rotuloTitulo="Nome do botão"
        exemploTitulo="Ex.: Fila cheia"
        rotuloTexto="Mensagem enviada"
        exemploTexto="Ex.: A fila está cheia hoje, mas a sua música está garantida!"
        textoVazio="Nenhuma resposta pronta. Crie algumas pra responder rápido no chat."
        textoAdicionar="Nova resposta"
      />
    </>
  )
}

const VAZIO = { titulo: '', texto: '' }

// Lista de um tipo de texto: adicionar, editar, ligar/desligar e excluir.
function ListaAvisos({ tipo, Icone, titulo, descricao, rotuloTitulo, exemploTitulo, rotuloTexto, exemploTexto, textoVazio, textoAdicionar }) {
  const { itens, loading, recarregar } = useAvisos(tipo, { todos: true })
  const [adicionando, setAdicionando] = useState(false)
  const [novo, setNovo] = useState(VAZIO)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(VAZIO)
  const [excluindo, setExcluindo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  async function executar(acao) {
    setOcupado(true)
    setErro('')
    try {
      await acao()
      await recarregar()
    } catch (e) {
      setErro(mapErroAdmin(e.message))
    } finally {
      setOcupado(false)
    }
  }

  const proximaOrdem = itens.reduce((max, a) => Math.max(max, a.ordem ?? 0), 0) + 1

  function adicionar(e) {
    e.preventDefault()
    return executar(async () => {
      await criarAviso({ tipo, ...novo, ordem: proximaOrdem })
      setNovo(VAZIO)
      setAdicionando(false)
    })
  }

  function salvarEdicao(e) {
    e.preventDefault()
    return executar(async () => {
      await atualizarAviso(editando, form)
      setEditando(null)
    })
  }

  return (
    <div className="q-card adm-av">
      <h3 className="adm-h2"><Icone size={15} /> {titulo}</h3>
      <p className="adm-modo__desc">{descricao}</p>

      {!adicionando ? (
        <button
          type="button"
          className="q-btn q-btn--primary q-btn--sm"
          onClick={() => {
            setAdicionando(true)
            setEditando(null)
            setErro('')
          }}
        >
          <Plus size={15} /> {textoAdicionar}
        </button>
      ) : (
        <FormAviso
          valor={novo}
          onChange={setNovo}
          onSubmit={adicionar}
          onCancelar={() => {
            setAdicionando(false)
            setNovo(VAZIO)
            setErro('')
          }}
          rotuloTitulo={rotuloTitulo}
          exemploTitulo={exemploTitulo}
          rotuloTexto={rotuloTexto}
          exemploTexto={exemploTexto}
          rotuloEnviar={ocupado ? 'Salvando…' : 'Salvar'}
          ocupado={ocupado}
        />
      )}

      {erro && (
        <p className="q-error" style={{ marginTop: '0.7rem' }} role="alert">
          <AlertCircle size={16} /> {erro}
        </p>
      )}

      {loading ? (
        <p className="q-note">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="q-note q-note--soft" style={{ textAlign: 'left', marginTop: '1rem' }}>{textoVazio}</p>
      ) : (
        <ul className="adm-av__lista">
          {itens.map((a) =>
            editando === a.id ? (
              <li key={a.id} className="adm-av__item is-editando">
                <FormAviso
                  valor={form}
                  onChange={setForm}
                  onSubmit={salvarEdicao}
                  onCancelar={() => setEditando(null)}
                  rotuloTitulo={rotuloTitulo}
                  exemploTitulo={exemploTitulo}
                  rotuloTexto={rotuloTexto}
                  exemploTexto={exemploTexto}
                  rotuloEnviar={ocupado ? 'Salvando…' : 'Salvar'}
                  ocupado={ocupado}
                />
              </li>
            ) : (
              <li key={a.id} className={`adm-av__item ${a.ativo ? '' : 'is-desligado'}`}>
                <span className="adm-av__txt">
                  <b>{a.titulo}</b>
                  <span>{a.texto}</span>
                  {!a.ativo && <i>desligado — o cliente não vê</i>}
                </span>
                <span className="adm-av__botoes">
                  <button
                    type="button"
                    className={`q-iconbtn ${a.ativo ? 'is-fixada' : ''}`}
                    onClick={() => executar(() => atualizarAviso(a.id, { ativo: !a.ativo }))}
                    disabled={ocupado}
                    aria-pressed={a.ativo}
                    aria-label={a.ativo ? `Desligar “${a.titulo}”` : `Ligar “${a.titulo}”`}
                    title={a.ativo ? 'Ligado — toque pra desligar' : 'Desligado — toque pra ligar'}
                  >
                    {a.ativo ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="q-iconbtn"
                    onClick={() => {
                      setEditando(a.id)
                      setForm({ titulo: a.titulo, texto: a.texto })
                      setAdicionando(false)
                      setExcluindo(null)
                      setErro('')
                    }}
                    disabled={ocupado}
                    aria-label={`Editar “${a.titulo}”`}
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="q-iconbtn"
                    onClick={() => setExcluindo(excluindo === a.id ? null : a.id)}
                    disabled={ocupado}
                    aria-label={`Excluir “${a.titulo}”`}
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>

                {excluindo === a.id && (
                  <div className="q-cancel adm-av__confirma" role="alert">
                    <span>Excluir “{a.titulo}”? Não dá pra desfazer.</span>
                    <div className="q-cancel__acts">
                      <button
                        type="button"
                        className="q-btn q-btn--danger q-btn--sm"
                        onClick={() =>
                          executar(async () => {
                            await excluirAviso(a.id)
                            setExcluindo(null)
                          })
                        }
                        disabled={ocupado}
                      >
                        <Trash2 size={14} /> Sim, excluir
                      </button>
                      <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={() => setExcluindo(null)} disabled={ocupado}>
                        <X size={14} /> Voltar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

function FormAviso({ valor, onChange, onSubmit, onCancelar, rotuloTitulo, exemploTitulo, rotuloTexto, exemploTexto, rotuloEnviar, ocupado }) {
  return (
    <form className="adm-cm__form" onSubmit={onSubmit}>
      <label className="adm-cm__campo">
        <span>{rotuloTitulo}</span>
        <input
          value={valor.titulo}
          onChange={(e) => onChange({ ...valor, titulo: e.target.value.slice(0, 120) })}
          placeholder={exemploTitulo}
          autoFocus
          required
        />
      </label>
      <label className="adm-cm__campo">
        <span>{rotuloTexto}</span>
        <textarea
          className="adm-av__area"
          value={valor.texto}
          onChange={(e) => onChange({ ...valor, texto: e.target.value.slice(0, 600) })}
          placeholder={exemploTexto}
          rows={3}
          required
        />
        <small className="adm-av__conta">{valor.texto.length}/600</small>
      </label>
      <div className="adm-cm__acts">
        <button type="submit" className="q-btn q-btn--primary q-btn--sm" disabled={ocupado}>
          <Check size={15} /> {rotuloEnviar}
        </button>
        <button type="button" className="q-btn q-btn--ghost q-btn--sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
