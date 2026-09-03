import { useRelevantStyles, DefaultStylePanel, type TLUiStylePanelProps } from 'tldraw'

/** Hide style panel until tldraw has relevant styles (selection or draw tool). */
export function ConditionalStylePanel(props: TLUiStylePanelProps) {
  const styles = useRelevantStyles()
  if (!styles) return null
  return <DefaultStylePanel {...props} styles={styles} />
}
