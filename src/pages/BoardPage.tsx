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
        // Direct link still works via sync room even if metadata missing
        if (!cancelled) {
          setBoard({
            id: boardId!,
            name: 'Доска',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
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

  if (loading || !board) {
    return <div className="centered">Открываем доску…</div>
  }

  return (
    <>
      {error ? (
        <div className="banner">
          Метаданные доски недоступны, открываем комнату по ссылке.
        </div>
      ) : null}
      <BoardCanvas boardId={boardId} boardName={board.name} />
    </>
  )
}
