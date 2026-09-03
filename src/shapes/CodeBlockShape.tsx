import { useEffect, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { CodeEditor } from '../components/CodeEditor'
import { useDebouncedCallback, useFlushOnBlur } from '../lib/debounce'
import { CODE_BLOCK_TYPE } from '../../shared/schema'

export type CodeBlockShape = TLShape<typeof CODE_BLOCK_TYPE>

export class CodeBlockShapeUtil extends BaseBoxShapeUtil<CodeBlockShape> {
  static override type = CODE_BLOCK_TYPE
  static override props: RecordProps<CodeBlockShape> = {
    w: T.number,
    h: T.number,
    code: T.string,
    language: T.string,
  }

  getDefaultProps(): CodeBlockShape['props'] {
    return {
      w: 420,
      h: 280,
      code: '// код\nconsole.log("hello")\n',
      language: 'javascript',
    }
  }

  override canEdit = () => true

  getIndicatorPath(shape: CodeBlockShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  component(shape: CodeBlockShape) {
    return <CodeBlockComponent shape={shape} />
  }
}

function CodeBlockComponent({ shape }: { shape: CodeBlockShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [draftCode, setDraftCode] = useState(shape.props.code)
  const draftCodeRef = useRef(draftCode)
  draftCodeRef.current = draftCode
  const language =
    shape.props.language === 'python'
      ? 'python'
      : shape.props.language === 'javascript'
        ? 'javascript'
        : 'text'

  useEffect(() => {
    if (!isEditing) setDraftCode(shape.props.code)
  }, [isEditing, shape.props.code, shape.id])

  const persistCode = useDebouncedCallback((code: string) => {
    editor.updateShape({
      id: shape.id,
      type: CODE_BLOCK_TYPE,
      props: { code },
    })
  }, 250)

  useFlushOnBlur(
    () => {
      editor.updateShape({
        id: shape.id,
        type: CODE_BLOCK_TYPE,
        props: { code: draftCodeRef.current },
      })
    },
    containerRef,
    isEditing,
  )

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: 'all',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid #3b4252',
          background: '#1e1e2e',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          pointerEvents: isEditing ? 'all' : 'none',
        }}
        onPointerDown={
          isEditing
            ? (event) => {
                event.stopPropagation()
              }
            : undefined
        }
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#2b2d3a',
            color: '#cdd6f4',
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <span>Code · {shape.props.language}</span>
          <span style={{ opacity: 0.7 }}>
            {isEditing ? 'редактирование' : 'двойной клик'}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <CodeEditor
            value={draftCode}
            language={language}
            readOnly={!isEditing}
            onChange={(code) => {
              setDraftCode(code)
              persistCode(code)
            }}
          />
        </div>
      </div>
    </HTMLContainer>
  )
}
