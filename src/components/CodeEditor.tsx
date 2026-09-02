import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'

type CodeEditorProps = {
  value: string
  language: 'python' | 'javascript' | 'text'
  readOnly?: boolean
  onChange?: (value: string) => void
}

export function CodeEditor({
  value,
  language,
  readOnly = false,
  onChange,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return

    const languageExt =
      language === 'python'
        ? python()
        : language === 'javascript'
          ? javascript()
          : []

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          oneDark,
          languageExt,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '13px',
            },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            },
            '.cm-editor': {
              height: '100%',
            },
          }),
        ],
      }),
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Recreate only when language/readOnly changes; value synced below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', minHeight: 0 }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    />
  )
}
