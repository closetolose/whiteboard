import { useEffect, useRef, useState, type MouseEvent } from 'react'
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
import { runPython, stopPython } from '../lib/pyodide'
import { useDebouncedCallback, useFlushOnBlur } from '../lib/debounce'
import { PYTHON_BLOCK_TYPE } from '../../shared/schema'

export type PythonBlockShape = TLShape<typeof PYTHON_BLOCK_TYPE>

export class PythonBlockShapeUtil extends BaseBoxShapeUtil<PythonBlockShape> {
  static override type = PYTHON_BLOCK_TYPE
  static override props: RecordProps<PythonBlockShape> = {
    w: T.number,
    h: T.number,
    code: T.string,
    output: T.string,
  }

  getDefaultProps(): PythonBlockShape['props'] {
    return {
      w: 480,
      h: 360,
      code:
        'import time\n\nprint("Hello, Python!")\nfor i in range(20):\n    print(i)\n    time.sleep(0.2)\n',
      output: '',
    }
  }

  override canEdit = () => true

  getIndicatorPath(shape: PythonBlockShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  component(shape: PythonBlockShape) {
    return <PythonBlockComponent shape={shape} />
  }
}

function PythonBlockComponent({ shape }: { shape: PythonBlockShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [running, setRunning] = useState(false)
  const [loadingHint, setLoadingHint] = useState('')
  const [liveOutput, setLiveOutput] = useState<string | null>(null)
  const [draftCode, setDraftCode] = useState(shape.props.code)
  const draftCodeRef = useRef(draftCode)
  draftCodeRef.current = draftCode
  const latestOutputRef = useRef('')
  const shapeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runController = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      runController.current?.abort()
      if (shapeSyncTimer.current !== null) clearTimeout(shapeSyncTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!isEditing) setDraftCode(shape.props.code)
  }, [isEditing, shape.props.code, shape.id])

  const persistCode = useDebouncedCallback((code: string) => {
    editor.updateShape({
      id: shape.id,
      type: PYTHON_BLOCK_TYPE,
      props: { code },
    })
  }, 250)

  useFlushOnBlur(
    () => {
      editor.updateShape({
        id: shape.id,
        type: PYTHON_BLOCK_TYPE,
        props: { code: draftCodeRef.current },
      })
    },
    containerRef,
    isEditing,
  )

  function writeOutput(output: string, syncShape = false) {
    if (!mounted.current || !editor.getShape(shape.id)) return
    latestOutputRef.current = output
    setLiveOutput(output)
    if (!syncShape) {
      if (shapeSyncTimer.current !== null) return
      shapeSyncTimer.current = setTimeout(() => {
        shapeSyncTimer.current = null
        editor.updateShape({
          id: shape.id,
          type: PYTHON_BLOCK_TYPE,
          props: { output: latestOutputRef.current },
        })
      }, 200)
      return
    }
    if (shapeSyncTimer.current !== null) {
      clearTimeout(shapeSyncTimer.current)
      shapeSyncTimer.current = null
    }
    editor.updateShape({
      id: shape.id,
      type: PYTHON_BLOCK_TYPE,
      props: { output },
    })
  }

  async function handleRun(event: MouseEvent) {
    event.stopPropagation()
    setRunning(true)
    setLoadingHint('Загрузка Pyodide…')
    writeOutput('', true)
    const controller = new AbortController()
    runController.current = controller
    try {
      const output = await runPython(draftCodeRef.current, {
        signal: controller.signal,
        onStatus: (status) => { if (mounted.current) setLoadingHint(status) },
        onOutput: (next) => writeOutput(next, false),
      })
      writeOutput(output, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeOutput(message, true)
    } finally {
      runController.current = null
      if (mounted.current) {
        setRunning(false)
        setLoadingHint('')
        setLiveOutput(null)
      }
    }
  }

  function handleStop(event: MouseEvent) {
    event.stopPropagation()
    stopPython()
    setLoadingHint('Остановка…')
  }

  const displayedOutput = liveOutput ?? shape.props.output

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
          border: '1px solid #1f6f43',
          background: '#102418',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          pointerEvents: isEditing ? 'all' : 'none',
          fontFamily: 'system-ui, sans-serif',
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
            gap: 8,
            padding: '6px 10px',
            background: '#163524',
            color: '#d8f3dc',
            fontSize: 12,
          }}
        >
          <span>Python</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {loadingHint ? <span style={{ opacity: 0.8 }}>{loadingHint}</span> : null}
            {running ? (
              <button
                type="button"
                onClick={handleStop}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  background: '#c92a2a',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  pointerEvents: 'all',
                }}
              >
                ■ Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  background: '#2f9e44',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  pointerEvents: 'all',
                }}
              >
                ▶ Run
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <CodeEditor
            value={draftCode}
            language="python"
            readOnly={!isEditing || running}
            onChange={(code) => {
              setDraftCode(code)
              persistCode(code)
            }}
          />
        </div>
        <pre
          style={{
            margin: 0,
            padding: 10,
            maxHeight: '35%',
            overflow: 'auto',
            background: '#0b1a12',
            color: '#b7e4c7',
            fontSize: 12,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            borderTop: '1px solid #1f6f43',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'all',
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {displayedOutput || (running ? '…' : 'Вывод появится здесь')}
        </pre>
      </div>
    </HTMLContainer>
  )
}
