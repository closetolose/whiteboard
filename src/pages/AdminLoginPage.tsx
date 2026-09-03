import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginAdmin } from '../lib/api'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await loginAdmin(password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  return (
    <div className="home">
      <header className="home-hero">
        <p className="eyebrow">Админка</p>
        <h1>Вход</h1>
        <p className="lede">Только для преподавателя.</p>
        <form className="create-form" onSubmit={onSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="muted" style={{ marginTop: 16 }}>
          <Link to="/">← На главную</Link>
        </p>
      </header>
    </div>
  )
}
