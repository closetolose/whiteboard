import { useMemo, useState } from 'react'
import { useSync } from '@tldraw/sync'
import {
  Tldraw,
  defaultBindingUtils,
  defaultShapeUtils,
  type Editor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { BoardToolbar } from './BoardToolbar'
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

  const shapeUtils = useMemo(
    () => [...defaultShapeUtils, ...customShapeUtils],
    [],
  )

  const components = useMemo(
    () => ({
      StylePanel: ConditionalStylePanel,
    }),
    [],
  )

  const store = useSync({
    uri: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/connect/${boardId}`,
    assets: multiplayerAssets,
    shapeUtils,
    bindingUtils: defaultBindingUtils,
  })

  const shareUrl = `${window.location.origin}/board/${boardId}`

  if (store.status === 'loading') {
    return <div className="centered">Подключение к доске…</div>
  }

  if (store.status === 'error') {
    return (
      <div className="centered error">
        Ошибка синхронизации: {store.error.message}
      </div>
    )
  }

  return (
    <div className="board-shell">
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
  )
}
