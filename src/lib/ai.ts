import { createShapeId, toRichText, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import {
  MAX_AI_CONTEXT, MAX_AI_HISTORY, MAX_AI_HISTORY_CHARS, MAX_AI_IMAGE,
  parseAiActions, type AiAction, type AiMessage, type AiReply, type AiRequest, type AiStatus,
} from '../../shared/ai'
import { PYTHON_BLOCK_TYPE, TABLE_BLOCK_TYPE } from '../../shared/schema'

async function aiRequest<T>(boardId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/ai`, {
    credentials: 'same-origin', cache: 'no-store', ...init,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Ошибка запроса к ИИ')
  return result as T
}

export function getAiStatus(boardId: string, signal: AbortSignal) {
  return aiRequest<AiStatus>(boardId, { signal })
}

export async function askAi(boardId: string, request: AiRequest, signal: AbortSignal): Promise<AiReply> {
  signal.throwIfAborted()
  const reply = await abortable(aiRequest<AiReply>(boardId, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
  }), signal)
  if (typeof reply.text !== 'string') throw new Error('Некорректный ответ ИИ')
  return { text: reply.text, actions: parseAiActions(reply.actions) }
}

export function trimAiHistory(messages: AiMessage[]): AiMessage[] {
  const result: AiMessage[] = []
  let size = 0
  for (const message of messages.slice(-MAX_AI_HISTORY).reverse()) {
    const content = message.content.slice(0, 8000)
    if (size + content.length > MAX_AI_HISTORY_CHARS) break
    result.unshift({ role: message.role, content })
    size += content.length
  }
  return result
}

function contextText(editor: Editor, shape: TLShape): string {
  if (shape.type === PYTHON_BLOCK_TYPE || shape.type === 'code-block') return shape.props.code
  if (shape.type === TABLE_BLOCK_TYPE) return JSON.stringify(shape.props.cells)
  return editor.getShapeUtil(shape).getText(shape) ?? ''
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let cancel: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
  })
  try { return await Promise.race([operation, aborted]) }
  finally { signal.removeEventListener('abort', cancel!) }
}

export async function collectAiContext(
  editor: Editor, scope: 'page' | 'selection', includeImage: boolean, signal: AbortSignal,
): Promise<Pick<AiRequest, 'context' | 'image'>> {
  signal.throwIfAborted()
  const roots = scope === 'selection' ? editor.getSelectedShapeIds() : [...editor.getCurrentPageShapeIds()]
  if (scope === 'selection' && !roots.length) throw new Error('Сначала выделите объекты на доске.')
  const ids = [...editor.getShapeAndDescendantIds(roots)]
  let context = `Область: ${scope === 'selection' ? 'выделенные объекты' : 'текущая страница'}. Объектов: ${ids.length}.\n`
  for (const id of ids.slice(0, 200)) {
    const shape = editor.getShape(id)
    if (!shape) continue
    const line = JSON.stringify({ type: shape.type, content: contextText(editor, shape).slice(0, 8000) }) + '\n'
    if (context.length + line.length > MAX_AI_CONTEXT - 100) { context += '(Контекст сокращён.)'; break }
    context += line
  }
  if (ids.length > 200) context += '\n(Показаны первые 200 объектов.)'
  if (!includeImage || !ids.length) return { context }
  if (ids.length > 200) throw new Error('Для снимка выделите до 200 объектов или отключите снимок доски.')
  const bounds = editor.getSelectionPageBounds()
  const boxes = scope === 'selection' && bounds ? [bounds] : ids.map((id) => editor.getShapePageBounds(id)).filter(Boolean)
  if (!boxes.length) return { context }
  const width = Math.max(...boxes.map((box) => box!.maxX)) - Math.min(...boxes.map((box) => box!.minX))
  const height = Math.max(...boxes.map((box) => box!.maxY)) - Math.min(...boxes.map((box) => box!.minY))
  const scale = Math.min(1, 1600 / Math.max(width + 32, height + 32, 1))
  const { url } = await abortable(editor.toImageDataUrl(ids, {
    format: 'jpeg', quality: 0.8, background: true, padding: 16, pixelRatio: 1, scale,
  }), signal)
  signal.throwIfAborted()
  if (url.length > MAX_AI_IMAGE) throw new Error('Снимок слишком большой. Выделите меньше объектов или отключите снимок.')
  return { context, image: url }
}

export function addAiActions(editor: Editor, proposed: AiAction[]): TLShapeId[] {
  const actions = parseAiActions(proposed)
  const page = editor.getCurrentPageId()
  const center = editor.getViewportPageBounds().center
  const existing = editor.getCurrentPageShapes().map((shape) => editor.getShapePageBounds(shape)).filter(Boolean)
  const x = existing.length ? Math.max(...existing.map((box) => box!.maxX)) + 80 : center.x - 240
  let y = center.y - 180
  const ids: TLShapeId[] = []
  const mark = editor.markHistoryStoppingPoint('add-ai-content')
  try { editor.run(() => {
    for (const action of actions) {
      const id = createShapeId()
      ids.push(id)
      if (action.type === 'text') {
        editor.createShape({ id, type: 'text', parentId: page, x, y,
          props: { richText: toRichText(action.text), w: 480, autoSize: false, size: 's' } })
      } else if (action.type === 'python') {
        editor.createShape({ id, type: PYTHON_BLOCK_TYPE, parentId: page, x, y,
          props: { code: action.code, output: '', w: 480, h: 360 } })
      } else {
        editor.createShape({ id, type: TABLE_BLOCK_TYPE, parentId: page, x, y,
          props: { cells: action.cells, w: Math.max(480, action.cells[0].length * 120),
            h: Math.max(180, Math.min(700, action.cells.length * 38 + 60)) } })
      }
      y += (editor.getShapePageBounds(id)?.height ?? 360) + 40
    }
  }) } catch (error) { editor.bailToMark(mark); throw error }
  editor.select(...ids)
  editor.zoomToSelection({ animation: { duration: 200 } })
  return ids
}
