import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tsImport } from 'tsx/esm/api'
import { fileURLToPath } from 'node:url'
import { normalizeMathDelimiters } from '../src/lib/markdown.ts'
import { richAiReply } from './fixtures/ai-markdown.mjs'

const { default: AiMarkdown } = await tsImport('../src/components/AiMarkdown.tsx', {
  parentURL: import.meta.url, tsconfig: fileURLToPath(new URL('../tsconfig.app.json', import.meta.url)),
})

const render = (content) => renderToStaticMarkup(createElement(AiMarkdown, { content }))

test('AI answers render headings, highlighted Python, lists, tables and accessible math', () => {
  const html = render(richAiReply)
  assert.match(html, /<h3>1\. Функция f\(x\)<\/h3>/)
  assert.match(html, /<strong>логическое выражение<\/strong>/)
  assert.match(html, /hljs-keyword/)
  assert.match(html, /aria-label="Скопировать код"/)
  assert.match(html, /<ul>/)
  assert.match(html, /ai-markdown-table/)
  assert.match(html, /<thead>/)
  assert.match(html, /katex-display/)
  assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/)
  assert.doesNotMatch(html, /katex-error|```python|### 1\./)
})

test('TeX delimiters normalize in prose while fenced, inline and unfinished code stay unchanged', () => {
  const code = [
    '```python', String.raw`pattern = r"\(x\)"`, '```',
    '~~~text', String.raw`\[keep this\]`, '~~~',
    'Use `\\(x\\)` or `\\[x\\]` literally.',
    '```python', String.raw`print(r"\(unfinished\)")`,
  ].join('\n')
  assert.equal(normalizeMathDelimiters(code), code)
  const prose = String.raw`🙂 Условие \(a_1 \le x\).\[a+b\]`
  assert.equal(normalizeMathDelimiters(prose), '🙂 Условие $a_1 \\le x$.\n\n$$\na+b\n$$\n\n')
  assert.match(render('$x^2$ и $$y^2$$'), /katex/)
  assert.doesNotThrow(() => render('```unknown-language\ntext\n```'))
})

test('AI Markdown blocks raw HTML, executable links, remote images and trusted TeX commands', () => {
  const unsafe = [
    '<script>alert(1)</script>',
    '<iframe src="https://tracker.example/iframe"></iframe>',
    '<img src="https://tracker.example/raw" onerror="alert(1)">',
    '',
    '[click](javascript:alert%281%29)',
    '![external image](https://tracker.example/image)',
    String.raw`$\includegraphics{https://tracker.example/tex}$`,
    String.raw`$\href{javascript:alert(1)}{click}$`,
    String.raw`$\htmlStyle{background:url(https://tracker.example/style)}{x}$`,
  ].join('\n\n')
  const html = render(unsafe)
  assert.doesNotMatch(html, /<script|<iframe|<img|onerror=|href="javascript:|style="[^"]*url\(/i)
  assert.doesNotMatch(html, /(?:src|href)="https:\/\/tracker\.example/i)
  assert.match(html, /external image/)
  assert.match(render('[OpenAI](https://openai.com)'), /rel="noopener noreferrer"/)
})

test('Invalid or recursive math and escaped HTML in code remain readable without crashing the panel', () => {
  assert.doesNotThrow(() => render(String.raw`$\notACommand{x}$`))
  assert.doesNotThrow(() => render(String.raw`$\def\a{\a}\a$`))
  const html = render('```html\n<script>alert(1)</script>\n```')
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})
