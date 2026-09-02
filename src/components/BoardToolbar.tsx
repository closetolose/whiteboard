import { useMemo, useState, type CSSProperties } from 'react'
import type { Editor } from 'tldraw'
import { PYTHON_BLOCK_TYPE, TABLE_BLOCK_TYPE } from '../../shared/schema'

type BoardToolbarProps = {
  editor: Editor | null
  boardName: string
  shareUrl: string
}

export function BoardToolbar({ editor, boardName, shareUrl }: BoardToolbarProps) {
  const [copied, setCopied] = useState(false)

  const disabled = !editor

  const actions = useMemo(
    () => [
      {
        label: '+ Python',
        onClick: () => {
          if (!editor) return
          const center = editor.getViewportPageBounds().center
          editor.createShape({
            type: PYTHON_BLOCK_TYPE,
            x: center.x - 240,
            y: center.y - 180,
          })
        },
      },
      {
        label: '+ Таблица',
        onClick: () => {
          if (!editor) return
          const center = editor.getViewportPageBounds().center
          editor.createShape({
            type: TABLE_BLOCK_TYPE,
            x: center.x - 240,
            y: center.y - 110,
          })
        },
      },
      {
        label: '+ Image',
        onClick: () => {
          if (!editor) return
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            await editor.putExternalContent({
              type: 'files',
              files: [file],
              point: editor.getViewportPageBounds().center,
            })
          }
          input.click()
        },
      },
      {
        label: 'Export PNG',
        onClick: async () => {
          if (!editor) return
          const shapeIds = editor.getCurrentPageShapeIds()
          if (shapeIds.size === 0) return
          const { blob } = await editor.toImage([...shapeIds], {
            format: 'png',
            background: true,
            padding: 32,
          })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${boardName || 'board'}.png`
          a.click()
          URL.revokeObjectURL(url)
        },
      },
    ],
    [boardName, editor],
  )

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Скопируйте ссылку:', shareUrl)
    }
  }

  return (
    <div className="board-toolbar">
      <strong
        style={{
          fontSize: 13,
          marginRight: 4,
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {boardName}
      </strong>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={disabled}
          onClick={action.onClick}
          style={buttonStyle}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={copyLink}
        style={{ ...buttonStyle, background: '#1971c2', color: 'white' }}
      >
        {copied ? 'Скопировано' : 'Ссылка'}
      </button>
      <a href="/" style={{ ...buttonStyle, textDecoration: 'none', color: 'inherit' }}>
        Домой
      </a>
    </div>
  )
}

const buttonStyle: CSSProperties = {
  border: '1px solid rgba(0,0,0,0.12)',
  background: '#f8f9fa',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
