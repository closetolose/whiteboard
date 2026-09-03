import { useMemo, useReducer, useRef } from 'react'
import { useSync } from '@tldraw/sync'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { boardSchema } from '../../shared/schema.ts'
import { BoardToolbar } from './BoardToolbar'
import { BoardErrorBoundary } from './BoardErrorBoundary'
import { ConditionalStylePanel } from './ConditionalStylePanel'
import { multiplayerAssets } from '../lib/assets'
import { getOrCreateUser } from '../lib/user'
import { customShapeUtils } from '../shapes'

type SyncedBoardProps = {
  boardId: string
  boardName: string
}

/** Isolated sync layer — keeps useSync mounted with stable options. */
function SyncedBoard({ boardId, boardName }: SyncedBoardProps) {
  const editorRef = useRef<Editor | null>(null)
  const [, bumpToolbar] = useReducer((n: number) => n + 1, 0)

  const syncUri = useMemo(
    () =>
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/connect/${boardId}`,
    [boardId],
  )

  const components = useMemo(
    () => ({
      StylePanel: ConditionalStylePanel,
    }),
    [],
  )

  const store = useSync({
    uri: syncUri,
    assets: multiplayerAssets,
    schema: boardSchema,
    shapeUtils: customShapeUtils,
  })

  const shareUrl = `${window.location.origin}/board/${boardId}`

  if (store.status === 'loading') {
    return <div className="centered">Подключение к доске…</div>
  }

  if (store.status === 'error') {
    return (
      <div className="centered error">
        <p>Ошибка синхронизации: {store.error.message}</p>
        <p className="muted">
          <button type="button" className="ghost" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </p>
      </div>
    )
  }

  if (store.connectionStatus === 'offline') {
    return (
      <div className="centered">
        <p>Соединение с сервером потеряно.</p>
        <button type="button" className="ghost" onClick={() => window.location.reload()}>
          Обновить страницу
        </button>
      </div>
    )
  }

  return (
    <div className="board-shell">
      <BoardToolbar
        editor={editorRef.current}
        boardName={boardName}
        shareUrl={shareUrl}
      />
      <div className="board-canvas">
        <Tldraw
          licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
          store={store.store}
          shapeUtils={customShapeUtils}
          components={components}
          onMount={(nextEditor) => {
            const user = getOrCreateUser()
            nextEditor.user.updateUserPreferences({
              id: user.id,
              name: user.name,
              color: user.color,
            })
            editorRef.current = nextEditor
            bumpToolbar()
          }}
        />
      </div>
    </div>
  )
}

type BoardCanvasProps = {
  boardId: string
  boardName: string
}

export function BoardCanvas({ boardId, boardName }: BoardCanvasProps) {
  return (
    <BoardErrorBoundary>
      <SyncedBoard key={boardId} boardId={boardId} boardName={boardName} />
    </BoardErrorBoundary>
  )
}
