import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BoardCanvas } from '../components/BoardCanvas'
import { getBoard, type BoardMeta } from '../lib/api'

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const [board, setBoard] = useState<BoardMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!boardId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const meta = await getBoard(boardId!)
        if (!cancelled) setBoard(meta)
      } catch (err) {
        if (!cancelled) {
          setBoard(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [boardId])

  if (!boardId) {
    return (
      <div className="centered">
        Нет id доски. <Link to="/">На главную</Link>
      </div>
    )
  }

  if (loading) {
    return <div className="centered">Открываем доску…</div>
  }

  if (!board) {
    return (
      <div className="centered">
        <p>Доска не найдена.</p>
        <p className="muted">Проверьте ID или ссылку от преподавателя.</p>
        {error ? <p className="error-text">{error}</p> : null}
        <p>
          <Link to="/">На главную</Link>
        </p>
      </div>
    )
  }

  return <BoardCanvas boardId={boardId} boardName={board.name} />
}
