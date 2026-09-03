import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseBoardId } from '../lib/parseBoardId'

export function PublicHomePage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onOpen(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const boardId = parseBoardId(input)
    if (!boardId) {
      setError('Введите ID доски или вставьте ссылку вида /board/…')
      return
    }

    navigate(`/board/${boardId}`)
  }

  return (
    <div className="home">
      <header className="home-hero">
        <p className="eyebrow">Доска для занятий</p>
        <h1>Whiteboard</h1>
        <p className="lede">
          Откройте доску по ID или ссылке от преподавателя. Регистрация не
          нужна.
        </p>
        <form className="create-form" onSubmit={onOpen}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="ID доски или ссылка"
            autoComplete="off"
          />
          <button type="submit">Открыть доску</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </header>
    </div>
  )
}
