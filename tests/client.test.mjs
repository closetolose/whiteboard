import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import * as schema from '../shared/schema.ts'

async function loadSource(path, dependencies = {}, globals = {}, suffix = '') {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source + suffix, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports, require: (name) => {
      if (!(name in dependencies)) throw new Error(`Missing test dependency ${name}`)
      return dependencies[name]
    },
    setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    ...globals,
  })
  return exports
}

test('UUID polyfill remains nonrecursive on LAN HTTP and sets UUID version/variant', async () => {
  const crypto = { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) }
  const ids = await loadSource('src/lib/randomId.ts', {}, { crypto })
  ids.installCryptoRandomUUIDPolyfill()
  ids.installCryptoRandomUUIDPolyfill()
  const values = Array.from({ length: 1000 }, () => ids.randomId())
  assert.equal(new Set(values).size, 1000)
  assert.ok(values.every((id) => /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(id)))
})

test('table schema bounds rows, columns, normalized cell count and text', () => {
  const validate = (value) => schema.tableCellsValidator.validate(value)
  assert.doesNotThrow(() => validate([['one', 'two'], []]))
  assert.doesNotThrow(() => validate(Array.from({ length: 50 }, () => Array(20).fill(''))))
  assert.throws(() => validate([Array(200).fill(''), ...Array.from({ length: 199 }, () => [])]))
  assert.throws(() => validate(Array.from({ length: 101 }, () => [''])))
  assert.throws(() => validate([Array(21).fill('')]))
  assert.throws(() => validate(Array.from({ length: 51 }, () => Array(20).fill(''))))
  assert.throws(() => validate([['x'.repeat(2001)]]))
})

test('editing then resizing or blurring a table cannot replay an obsolete grid', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const slots = []
  let cursor = 0
  const react = {
    useMemo(callback) { return callback() },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value } },
    useState(value) {
      const i = cursor++
      if (!(i in slots)) slots[i] = value
      return [slots[i], (next) => { slots[i] = next }]
    },
    useEffect() {},
  }
  const debounce = await loadSource('src/lib/debounce.ts', { react })
  const updates = []
  let flush
  const jsx = (type, props) => ({ type, props })
  const exports = await loadSource('src/shapes/TableBlockShape.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    tldraw: {
      BaseBoxShapeUtil: class {}, HTMLContainer: 'container',
      useEditor: () => ({ updateShape: (shape) => updates.push(shape) }), useIsEditing: () => true,
    },
    '../lib/debounce': { ...debounce, useFlushOnBlur: (callback) => { flush = callback } },
    '../../shared/schema': schema,
  }, {}, '\nexport { TableBlockComponent };')
  const shape = { id: 'shape:table', props: { w: 480, h: 220, cells: [['a'], ['b'], ['c'], ['d']] } }
  const render = () => { cursor = 0; return exports.TableBlockComponent({ shape }) }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found } }
    else {
      if (predicate(node)) return node
      return find(node.props?.children, predicate)
    }
  }
  let tree = render()
  find(tree, (n) => n.type === 'input').props.onChange({ target: { value: 'edited' } })
  tree = render()
  find(tree, (n) => n.props?.children === '+ строка').props.onClick()
  assert.equal(updates.at(-1).props.cells.length, 5)
  t.mock.timers.tick(300)
  assert.equal(updates.at(-1).props.cells.length, 5)
  assert.equal(updates.at(-1).props.cells[0][0], 'edited')
  tree = render()
  find(tree, (n) => n.type === 'input').props.onChange({ target: { value: 'edited twice' } })
  tree = render()
  find(tree, (n) => n.props?.children === '+ столбец').props.onClick()
  t.mock.timers.tick(300)
  assert.equal(updates.at(-1).props.cells[0].length, 2)
  assert.equal(updates.at(-1).props.cells[0][0], 'edited twice')
  tree = render()
  find(tree, (n) => n.type === 'input').props.onChange({ target: { value: 'blurred' } })
  render()
  flush()
  const saved = updates.length
  t.mock.timers.tick(300)
  assert.equal(updates.length, saved)
  assert.equal(updates.at(-1).props.cells[0][0], 'blurred')
})

test('failed Python initialization always releases running state and supports retry/Stop', async () => {
  let channel, mode = 'failed', frame
  class TestChannel {
    constructor() {
      channel = this
      this.port1 = {
        close() {},
        postMessage(data) {
          if (data.type === 'run' && mode !== 'hang') {
            queueMicrotask(() => channel.port1.onmessage({ data: { type: 'done', output: mode === 'failed' ? 'Loader failure' : 'success' } }))
          }
          if (data.type === 'stop') queueMicrotask(() => channel.port1.onmessage({ data: { type: 'done', output: 'Остановлено' } }))
        },
      }
      this.port2 = { close() {} }
    }
  }
  const python = await loadSource('src/lib/pyodide.ts', { './pythonSandbox': { PYTHON_SANDBOX_HTML: 'sandbox' } }, {
    MessageChannel: TestChannel,
    document: {
      createElement() {
        frame = {
          sandbox: { add(value) { assert.equal(value, 'allow-scripts') } }, setAttribute() {}, remove() {},
          contentWindow: { postMessage() { queueMicrotask(() => channel.port1.onmessage({ data: { type: 'ready' } })) } },
        }
        return frame
      },
      body: { appendChild() { frame.onload() } },
    },
  })
  assert.equal(await python.runPython('print(1)'), 'Loader failure')
  assert.equal(python.isPythonRunning(), false)
  await assert.rejects(python.runPython('', { onStatus() { throw new Error('callback failed') } }), /callback failed/)
  assert.equal(python.isPythonRunning(), false)
  mode = 'success'
  assert.equal(await python.runPython('print(1)'), 'success')
  mode = 'hang'
  const running = python.runPython('while True: pass')
  assert.equal(python.isPythonRunning(), true)
  python.stopPython()
  assert.equal(await running, 'Остановлено')
  assert.equal(python.isPythonRunning(), false)
})
