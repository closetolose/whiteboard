import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchAdminMe } from '../lib/api'

export function AdminGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let cancelled = false
    void fetchAdminMe()
      .then(() => {
        if (!cancelled) setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) setStatus('denied')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'loading') {
    return <div className="centered">Проверяем доступ…</div>
  }

  if (status === 'denied') {
    return <Navigate to="/admin/login" replace />
  }

  return children
}
