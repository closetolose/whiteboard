export const AI_MODEL = 'gpt-6-luna'
export const MAX_AI_MESSAGE = 4000
export const MAX_AI_CONTEXT = 20000
export const MAX_AI_HISTORY = 12
export const MAX_AI_HISTORY_CHARS = 24000
export const MAX_AI_IMAGE = 1400000
export const MAX_AI_ACTIONS = 6

export type AiMessage = { role: 'user' | 'assistant'; content: string }
export type AiRequest = {
  message: string
  history: AiMessage[]
  context: string
  image?: string
}
export type AiAction =
  | { type: 'text'; text: string }
  | { type: 'python'; code: string }
  | { type: 'table'; cells: string[][] }
export type AiReply = { text: string; actions: AiAction[] }
export type AiStatus = { configured: boolean; model: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ожидался объект')
  return value as Record<string, unknown>
}

function text(value: unknown, limit: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) {
    throw new Error(`Текст должен содержать от ${allowEmpty ? 0 : 1} до ${limit} символов`)
  }
  return value
}

export function parseAiRequest(value: unknown): AiRequest {
  const input = object(value)
  const message = text(input.message, MAX_AI_MESSAGE).trim()
  const context = text(input.context ?? '', MAX_AI_CONTEXT, true)
  if (!Array.isArray(input.history) || input.history.length > MAX_AI_HISTORY) {
    throw new Error('Слишком длинная история чата')
  }
  let historyChars = 0
  const history = input.history.map((item): AiMessage => {
    const entry = object(item)
    if (entry.role !== 'user' && entry.role !== 'assistant') throw new Error('Недопустимая роль сообщения')
    const content = text(entry.content, 8000)
    historyChars += content.length
    return { role: entry.role, content }
  })
  if (historyChars > MAX_AI_HISTORY_CHARS) throw new Error('Слишком длинная история чата')
  const image = input.image === undefined ? undefined : text(input.image, MAX_AI_IMAGE)
  if (image && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new Error('Снимок должен быть в формате PNG или JPEG')
  }
  // Only these fields reach the provider; client-supplied roles, tools and model are ignored.
  return { message, history, context, ...(image ? { image } : {}) }
}

export function parseAiActions(value: unknown): AiAction[] {
  if (!Array.isArray(value) || value.length > MAX_AI_ACTIONS) throw new Error('Слишком много объектов ИИ')
  return value.map((item): AiAction => {
    const action = object(item)
    if (action.type === 'text') return { type: 'text', text: text(action.text, 8000) }
    if (action.type === 'python') return { type: 'python', code: text(action.code, 12000) }
    if (action.type === 'table') {
      const cells = action.cells
      if (!Array.isArray(cells) || !cells.length || cells.length > 20) throw new Error('В таблице нужно от 1 до 20 строк')
      const columns = Array.isArray(cells[0]) ? cells[0].length : 0
      if (!columns || columns > 8 || cells.length * columns > 160) throw new Error('В таблице нужно от 1 до 8 столбцов')
      return {
        type: 'table', cells: cells.map((row) => {
          if (!Array.isArray(row) || row.length !== columns) throw new Error('Строки таблицы должны быть одной длины')
          return row.map((cell) => text(cell, 500, true))
        }),
      }
    }
    throw new Error('Неизвестный тип объекта ИИ')
  })
}
