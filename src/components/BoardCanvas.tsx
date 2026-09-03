import { useMemo, useState } from 'react'
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

type BoardCanvasProps = {
  boardId: string
  boardName: string
}

export function BoardCanvas({ boardId, boardName }: BoardCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)

  const components = useMemo(
    () => ({
      StylePanel: ConditionalStylePanel,
    }),
    [],
  )

  const store = useSync({
    uri: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/connect/${boardId}`,
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

  const offline = store.connectionStatus === 'offline'

  return (
    <BoardErrorBoundary>
      <div className="board-shell">
        {offline ? (
          <div className="banner">
            Соединение с сервером потеряно.{' '}
            <button type="button" className="ghost" onClick={() => window.location.reload()}>
              Обновить
            </button>
          </div>
        ) : null}
        <BoardToolbar editor={editor} boardName={boardName} shareUrl={shareUrl} />
        <div className="board-canvas">
          <Tldraw
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
              setEditor(nextEditor)
            }}
          />
        </div>
      </div>
    </BoardErrorBoundary>
  )
}
