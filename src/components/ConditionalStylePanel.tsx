import { useEditor, useValue } from '@tldraw/editor'
import { DefaultStylePanel, type TLUiStylePanelProps } from 'tldraw'

/** Hide style panel until a shape is selected or a drawing tool is active. */
export function ConditionalStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor()
  const show = useValue(
    'stylePanelVisible',
    () => {
      if (editor.getSelectedShapeIds().length > 0) return true
      return Boolean(editor.root.getCurrent()?.shapeType)
    },
    [editor],
  )

  if (!show) return null
  return <DefaultStylePanel {...props} />
}
