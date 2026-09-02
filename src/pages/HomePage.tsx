import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createBoard,
  deleteBoard,
  listBoards,
  type BoardMeta,
} from '../lib/api'

export function HomePage() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      navigate(`/board/${board.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Удалить доску из списка?')) return
    try {
      await deleteBoard(id)
      setBoards((prev) => prev.filter((board) => board.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="home">
      <header className="home-hero">
        <p className="eyebrow">Локальная доска для занятий</p>
        <h1>Whiteboard</h1>
        <p className="lede">
          Рисуйте, вставляйте картинки, пишите код и запускайте Python. Доступ по
          ссылке — без регистрации.
        </p>
        <form className="create-form" onSubmit={onCreate}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название доски (необязательно)"
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Создаём…' : 'Создать доску'}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </header>

      <section className="board-list">
        <div className="section-head">
          <h2>Ваши доски</h2>
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
                  обновлено {new Date(board.updated_at).toLocaleString('ru-RU')}
                </small>
              </div>
              <button type="button" className="ghost danger" onClick={() => void onDelete(board.id)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
