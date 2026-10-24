import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AiSettingsForm } from '../components/AiSettingsForm'
import {
  createBoard,
  deleteBoard,
  listBoards,
  logoutAdmin,
  type BoardMeta,
} from '../lib/api'

export function AdminPage() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setBoards(await listBoards())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const board = await createBoard(name || undefined)
      setName('')
      await refresh()
      navigate(`/board/${board.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Удалить доску?')) return
    try {
      await deleteBoard(id)
      setBoards((prev) => prev.filter((board) => board.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onLogout() {
    await logoutAdmin()
    navigate('/admin/login', { replace: true })
  }

  async function copyLink(id: string) {
    const url = `${window.location.origin}/board/${id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      window.prompt('Скопируйте ссылку:', url)
    }
  }

  return (
    <div className="home">
      <header className="home-hero">
        <p className="eyebrow">Админка</p>
        <h1>Доски</h1>
        <p className="lede">Создавайте доски и отправляйте ученикам ссылку или ID.</p>
        <form className="create-form" onSubmit={onCreate}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название доски (необязательно)"
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Создаём…' : 'Создать доску'}
          </button>
          <button type="button" className="ghost" onClick={() => void onLogout()}>
            Выйти
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="muted" style={{ marginTop: 12 }}>
          <Link to="/">← На главную</Link>
          {' · '}<a href="#ai-settings">Настройки ИИ</a>
        </p>
      </header>

      <AiSettingsForm />

      <section className="board-list">
        <div className="section-head">
          <h2>Все доски</h2>
          <button type="button" className="ghost" onClick={() => void refresh()}>
            Обновить
          </button>
        </div>
        {loading ? <p>Загрузка…</p> : null}
        {!loading && boards.length === 0 ? (
          <p className="muted">Пока пусто — создайте первую доску.</p>
        ) : null}
        <ul>
          {boards.map((board) => (
            <li key={board.id}>
              <div>
                <Link to={`/board/${board.id}`}>{board.name}</Link>
                <small>
                  {board.id} · обновлено{' '}
                  {new Date(board.updated_at).toLocaleString('ru-RU')}
                </small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="ghost" onClick={() => void copyLink(board.id)}>
                  {copiedId === board.id ? 'Скопировано' : 'Ссылка'}
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => void onDelete(board.id)}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
