import { memo, useEffect, useRef, useState, type ComponentProps } from 'react'
import Markdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import { normalizeMathDelimiters } from '../lib/markdown'

const languages = { python, javascript, typescript, json, bash, sql }
const languageLabels: Record<string, string> = {
  python: 'Python', py: 'Python', javascript: 'JavaScript', js: 'JavaScript',
  typescript: 'TypeScript', ts: 'TypeScript', json: 'JSON', bash: 'Bash', sh: 'Shell', sql: 'SQL',
}

function nodeText(node: { type: string; value?: string; children?: Parameters<typeof nodeText>[0][] }): string {
  return node.type === 'text' ? node.value ?? '' : node.children?.map(nodeText).join('') ?? ''
}

function CodeBlock({ children, node, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const [feedback, setFeedback] = useState('')
  const code = node?.children.find((item) => item.type === 'element' && item.tagName === 'code')
  const classes = code?.type === 'element' ? code.properties.className : []
  const language = Array.isArray(classes) ? String(classes.find((name) => String(name).startsWith('language-')) ?? '').slice(9, 41) : ''
  const source = code ? nodeText(code).replace(/\n$/, '') : ''

  useEffect(() => {
    if (!feedback) return
    const timeout = setTimeout(() => setFeedback(''), 2000)
    return () => clearTimeout(timeout)
  }, [feedback])

  async function copy() {
    try {
      await navigator.clipboard.writeText(source)
      setFeedback('Скопировано')
    } catch {
      const pre = preRef.current
      if (!pre) return
      const range = document.createRange()
      range.selectNodeContents(pre)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      pre.focus()
      setFeedback('Код выделен: Ctrl+C')
    }
  }

  return <div className="ai-code-block">
    <div className="ai-code-header">
      <span>{languageLabels[language] ?? (language || 'Код')}</span>
      <button type="button" aria-label="Скопировать код" onClick={() => { void copy() }}>
        <span aria-live="polite">{feedback || 'Копировать'}</span>
      </button>
    </div>
    <pre {...props} ref={preRef} tabIndex={0}>{children}</pre>
  </div>
}

const components: Components = {
  pre: CodeBlock,
  table: ({ children }) => <div className="ai-markdown-table" tabIndex={0}><table>{children}</table></div>,
  a: ({ href, children, title }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
  // Model-provided images must not trigger requests to arbitrary external hosts.
  img: ({ alt }) => <span className="ai-image-label">{alt || 'Изображение'}</span>,
}

export default memo(function AiMarkdown({ content }: { content: string }) {
  return <div className="ai-markdown">
    <Markdown skipHtml components={components} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[
      [rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 10 }],
      [rehypeHighlight, { languages, detect: false }],
    ]}>{normalizeMathDelimiters(content)}</Markdown>
  </div>
})
