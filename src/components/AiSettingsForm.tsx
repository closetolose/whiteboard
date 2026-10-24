import { useEffect, useState, type FormEvent } from 'react'
import { AI_BASE_URL, AI_MODEL, type AiSettingsView } from '../../shared/ai'
import { getAiSettings, saveAiSettings } from '../lib/api'

export function AiSettingsForm() {
  const [settings, setSettings] = useState<AiSettingsView | null>(null)
  const [baseUrl, setBaseUrl] = useState(AI_BASE_URL)
  const [model, setModel] = useState(AI_MODEL)
  const [apiKey, setApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getAiSettings(controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setSettings(next)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки ИИ')
    })
    return () => controller.abort()
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || !settings) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const next = await saveAiSettings({ baseUrl, model, apiKey, clearApiKey })
      setSettings(next)
      setBaseUrl(next.baseUrl)
      setModel(next.model)
      setApiKey('')
      setClearApiKey(false)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки ИИ') }
    finally { setSaving(false) }
  }

  function changed() { setSaved(false); setError('') }

  return (
    <section className="ai-settings" id="ai-settings" aria-labelledby="ai-settings-heading">
      <h2 id="ai-settings-heading">Настройки ИИ</h2>
      <p className="muted">Общие для всех досок. После сохранения новые запросы сразу используют эти настройки.</p>
      {!settings && !error && <p role="status">Загрузка настроек…</p>}
      <form onSubmit={(event) => { void save(event) }} autoComplete="off">
        <fieldset disabled={!settings || saving}>
          <label htmlFor="ai-base-url">API Host / Base URL</label>
          <input id="ai-base-url" name="baseUrl" type="url" required maxLength={2048} spellCheck={false}
            value={baseUrl} placeholder="https://taynik.store/v1" aria-describedby="ai-base-url-hint"
            onChange={(event) => { setBaseUrl(event.target.value); changed() }} />
          <small id="ai-base-url-hint">Например, https://taynik.store/v1. Указывайте базовый адрес без /chat/completions или /responses.</small>

          <label htmlFor="ai-api-key">API Key</label>
          <input id="ai-api-key" name="apiKey" type="password" autoComplete="new-password" maxLength={4096}
            value={apiKey} disabled={clearApiKey} spellCheck={false} aria-describedby="ai-api-key-hint"
            placeholder={settings?.hasApiKey ? 'Ключ сохранён — оставьте пустым, чтобы сохранить его' : 'Введите API-ключ провайдера'}
            onChange={(event) => { setApiKey(event.target.value); changed() }} />
          <small id="ai-api-key-hint">{settings?.hasApiKey ? 'Ключ уже настроен. Для замены введите новый.' : 'API-ключ ещё не настроен.'} Ключ хранится на сервере и не показывается участникам.</small>
          {settings?.hasApiKey && <label className="ai-settings-clear"><input type="checkbox" checked={clearApiKey}
            onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(''); changed() }} />Удалить текущий API Key</label>}

          <label htmlFor="ai-model">Model</label>
          <input id="ai-model" name="model" required maxLength={200} spellCheck={false} value={model} placeholder="gpt-6-luna"
            onChange={(event) => { setModel(event.target.value); changed() }} />
          <small>Точное имя модели из кабинета провайдера, например gpt-6-luna.</small>
          <button type="submit" className="ai-primary">{saving ? 'Сохраняем…' : 'Сохранить настройки'}</button>
        </fieldset>
        {error && <p className="error-text" role="alert">{error}</p>}
        {saved && <p role="status">Настройки сохранены. {settings?.hasApiKey ? 'Изменения применены к новым запросам.' : 'Укажите API Key, чтобы включить помощника.'}</p>}
      </form>
    </section>
  )
}
