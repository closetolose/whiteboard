import { fromMarkdown } from 'mdast-util-from-markdown'

type MarkdownNode = {
  type: string
  position?: { start: { offset?: number }; end: { offset?: number } }
  children?: MarkdownNode[]
}

/** Support the TeX delimiters used by chat models without rewriting code samples. */
export function normalizeMathDelimiters(source: string): string {
  if (!source.includes('\\(') && !source.includes('\\[')) return source
  const codeRanges: Array<[number, number]> = []
  function visit(node: MarkdownNode) {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (start !== undefined && end !== undefined) codeRanges.push([start, end])
    } else node.children?.forEach(visit)
  }
  visit(fromMarkdown(source))
  function normalize(text: string) {
    return text.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g, (_match, display: string | undefined, inline: string | undefined) =>
      display !== undefined ? `\n\n$$\n${display.trim()}\n$$\n\n` : `$${inline}$`)
  }
  let result = ''
  let offset = 0
  for (const [start, end] of codeRanges) {
    result += normalize(source.slice(offset, start)) + source.slice(start, end)
    offset = end
  }
  return result + normalize(source.slice(offset))
}
