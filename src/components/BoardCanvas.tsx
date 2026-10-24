import { useMemo, useState } from 'react'
import { useSync } from '@tldraw/sync'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { boardSchema } from '../../shared/schema.ts'
import { BoardToolbar } from './BoardToolbar'
import { AiPanel } from './AiPanel'
import { BoardErrorBoundary } from './BoardErrorBoundary'
import { ConditionalStylePanel } from './ConditionalStylePanel'
import { createMultiplayerAssets } from '../lib/assets'
import { getOrCreateUser } from '../lib/user'
import { customShapeUtils } from '../shapes'

type SyncedBoardProps = {
  boardId: string
  boardName: string
}

/** Isolated sync layer — keeps useSync mounted with stable options. */
function SyncedBoard({ boardId, boardName }: SyncedBoardProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [aiOpen, setAiOpen] = useState(false)

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

  const assets = useMemo(() => createMultiplayerAssets(boardId), [boardId])
  const store = useSync({
    uri: syncUri,
    assets,
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
    <div className={`board-shell${aiOpen ? ' ai-open' : ''}`}>
      <BoardToolbar
        editor={editor}
        boardName={boardName}
        shareUrl={shareUrl}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((previous) => !previous)}
      />
      <AiPanel editor={editor} boardId={boardId} open={aiOpen} onClose={() => setAiOpen(false)} />
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
            setEditor(nextEditor)
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
