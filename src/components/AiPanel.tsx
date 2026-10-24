import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Editor } from 'tldraw'
import { AI_MODEL, MAX_AI_MESSAGE, type AiAction, type AiMessage, type AiStatus } from '../../shared/ai'
import { addAiActions, askAi, collectAiContext, getAiStatus, trimAiHistory } from '../lib/ai'

type ChatEntry = AiMessage & { id: number; actions?: AiAction[]; added?: boolean }
type PendingRequest = { controller: AbortController; message: string; entryId: number; sent: boolean }

export function AiPanel({ editor, boardId, open, onClose }: {
  editor: Editor | null; boardId: string; open: boolean; onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<'page' | 'selection'>('page')
  const [includeImage, setIncludeImage] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const requestRef = useRef<PendingRequest | null>(null)
  const nextId = useRef(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!open) { cancelRequest(); return }
    const controller = new AbortController()
    getAiStatus(boardId, controller.signal).then((next) => {
      if (!controller.signal.aborted) { setStatus(next); setStatusError('') }
    }).catch((reason) => {
      if (!controller.signal.aborted) setStatusError(reason instanceof Error ? reason.message : 'Не удалось проверить подключение ИИ')
    })
    inputRef.current?.focus()
    return () => { controller.abort(); cancelRequest() }
  }, [boardId, open])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])

  if (!open) return null

  function cancelRequest(reason = '') {
    const pending = requestRef.current
    if (!pending) return
    // Release the composer immediately, even if a browser transport delays abort.
    requestRef.current = null
    pending.controller.abort()
    if (pending.sent) {
      setMessages((previous) => previous.filter((entry) => entry.id !== pending.entryId))
      setDraft(pending.message)
    }
    setBusy(false)
    setError(reason)
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!editor || requestRef.current || !draft.trim() || !status?.configured) return
    const controller = new AbortController()
    const signal = controller.signal
    const message = draft.trim()
    const userEntry: ChatEntry = { id: nextId.current++, role: 'user', content: message }
    const pending: PendingRequest = { controller, message, entryId: userEntry.id, sent: false }
    requestRef.current = pending
    const timeout = setTimeout(() => {
      if (requestRef.current === pending) cancelRequest('Истекло время ожидания. Попробуйте запрос покороче.')
    }, 65000)
    setBusy(true)
    setError('')
    setProgress('Подготовка доски…')
    try {
      const context = await collectAiContext(editor, scope, includeImage, signal)
      signal.throwIfAborted()
      if (requestRef.current !== pending) return
      setMessages((previous) => [...previous, userEntry])
      pending.sent = true
      setDraft('')
      setProgress('Помощник думает…')
      const reply = await askAi(boardId, { message, history: trimAiHistory(messages), ...context }, signal)
      if (signal.aborted || requestRef.current !== pending) return
      setMessages((previous) => [...previous, { id: nextId.current++, role: 'assistant', content: reply.text, actions: reply.actions }])
    } catch (reason) {
      if (requestRef.current !== pending) return
      if (pending.sent) {
        setMessages((previous) => previous.filter((entry) => entry.id !== userEntry.id))
        setDraft(message)
      }
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Не удалось получить ответ ИИ')
      }
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === pending) { requestRef.current = null; setBusy(false) }
    }
  }

  function apply(entry: ChatEntry) {
    if (!editor || entry.added || !entry.actions?.length) return
    try {
      addAiActions(editor, entry.actions)
      setMessages((previous) => previous.map((item) => item.id === entry.id ? { ...item, added: true } : item))
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось добавить объекты') }
  }

  return (
    <aside className="ai-panel" aria-label="ИИ-помощник" onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape') onClose()
    }}>
      <header className="ai-header">
        <div><strong>Помощник по доске</strong><small>{status?.model ?? AI_MODEL}</small></div>
        <button type="button" className="ai-close" aria-label="Закрыть помощника" onClick={onClose}>×</button>
      </header>
      <div className="ai-messages" role="log" aria-label="Переписка с помощником" aria-live="polite" aria-relevant="additions">
        {!messages.length && <div className="ai-empty">
          <p>Разберём задачу вместе</p>
          <span>Попросите объяснить материал, найти ошибку в коде или подготовить таблицу.</span>
          <div className="ai-examples">
            {['Объясни содержимое доски', 'Создай пример Python с циклом', 'Сделай таблицу по теме занятия'].map((example) => (
              <button type="button" key={example} disabled={busy} onClick={() => { setDraft(example); inputRef.current?.focus() }}>{example}</button>
            ))}
          </div>
        </div>}
        {messages.map((entry) => <article key={entry.id} className={`ai-message ai-message-${entry.role}`}>
          <strong>{entry.role === 'user' ? 'Вы' : 'Помощник'}</strong>
          <div className="ai-message-text">{entry.content}</div>
          {entry.actions?.length ? <div className="ai-proposals">
            {entry.actions.map((action, index) => <details key={index}>
              <summary>{action.type === 'python' ? 'Python-блок' : action.type === 'table' ? 'Таблица' : 'Текст'}</summary>
              {action.type === 'table' ? <div className="ai-table-scroll"><table><tbody>{action.cells.map((row, r) =>
                <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>
                : <pre>{action.type === 'python' ? action.code : action.text}</pre>}
            </details>)}
            <button type="button" className="ai-primary" disabled={!editor || entry.added} onClick={() => apply(entry)}>
              {entry.added ? 'Добавлено на доску' : `Добавить на доску (${entry.actions.length})`}
            </button>
          </div> : null}
        </article>)}
        {busy && <p className="ai-progress" role="status">{progress}</p>}
        <div ref={bottomRef} />
      </div>
      <form className="ai-form" onSubmit={(event) => { void send(event) }}>
        <div className="ai-context-controls">
          <label>Контекст <select aria-label="Область доски для ИИ" value={scope} disabled={busy}
            onChange={(event) => setScope(event.target.value as 'page' | 'selection')}>
            <option value="page">Вся страница</option><option value="selection">Выделенные объекты</option>
          </select></label>
          <label className="ai-image-option"><input type="checkbox" checked={includeImage} disabled={busy}
            onChange={(event) => setIncludeImage(event.target.checked)} />Прикрепить снимок доски</label>
        </div>
        {statusError && <p className="ai-error" role="alert">{statusError} Закройте и откройте помощника для повторной проверки.</p>}
        {status && !status.configured && <p className="ai-error" role="status">Владелец сайта ещё не подключил ИИ.</p>}
        {error && <p className="ai-error" role="alert">{error}</p>}
        <textarea ref={inputRef} aria-label="Сообщение помощнику" placeholder="Напишите, чем помочь…" value={draft}
          maxLength={MAX_AI_MESSAGE} disabled={busy || !editor || !status?.configured}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
          }} />
        <div className="ai-form-footer"><span>Ctrl + Enter</span>
          {busy ? <button key="stop" type="button" className="ai-secondary" onClick={(event) => {
            event.preventDefault()
            cancelRequest()
          }}>Остановить</button>
            : <button key="send" type="submit" className="ai-primary" disabled={!draft.trim() || !editor || !status?.configured}>Отправить</button>}
        </div>
        <p className="ai-privacy">Контекст и снимок передаются выбранному API-сервису. Переписка видна только вам и хранится до перезагрузки страницы. ИИ может ошибаться.</p>
      </form>
    </aside>
  )
}
