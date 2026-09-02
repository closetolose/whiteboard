type PyodideInterface = {
  runPythonAsync: (code: string) => Promise<unknown>
  globals: {
    set: (name: string, value: unknown) => void
  }
  setStdout: (options: { batched?: (text: string) => void }) => void
  setStderr: (options: { batched?: (text: string) => void }) => void
}

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInterface>
    __wbShouldStop?: () => boolean
  }
}

const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/'
const MAX_OUTPUT_CHARS = 120_000
const UI_FLUSH_MS = 50

let loadPromise: Promise<PyodideInterface> | null = null
let shouldStop = false
let running = false

async function ensurePyodideScript() {
  if (window.loadPyodide) return

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PYODIDE_INDEX}pyodide.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Pyodide'))
    document.head.appendChild(script)
  })
}

export async function getPyodide(): Promise<PyodideInterface> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await ensurePyodideScript()
      if (!window.loadPyodide) {
        throw new Error('Pyodide loader missing')
      }
      return window.loadPyodide({ indexURL: PYODIDE_INDEX })
    })()
  }
  return loadPromise
}

export function stopPython() {
  shouldStop = true
}

export function isPythonRunning() {
  return running
}

function appendOutput(current: string, chunk: string): string {
  if (!chunk) return current
  // Pyodide `batched` often delivers a line without the trailing newline
  // that triggered the flush — restore it so prints stack vertically.
  const piece = chunk.endsWith('\n') ? chunk : `${chunk}\n`
  const next = current ? `${current}${piece}` : piece

  if (next.length <= MAX_OUTPUT_CHARS) return next
  return `… [вывод обрезан]\n${next.slice(-MAX_OUTPUT_CHARS)}`
}

const BOOTSTRAP = `
import ast
import asyncio
import builtins
import sys
import time
from js import __wbShouldStop

_real_print = builtins.print
_print_n = 0
_print_last = time.time()

def __wb_check_stop():
    if __wbShouldStop():
        raise KeyboardInterrupt("Остановлено")

async def __wb_print(*args, **kwargs):
    global _print_n, _print_last
    _real_print(*args, **kwargs)
    try:
        sys.stdout.flush()
    except Exception:
        pass
    __wb_check_stop()
    _print_n += 1
    now = time.time()
    if _print_n >= 24 or (now - _print_last) >= 0.05:
        _print_n = 0
        _print_last = now
        await asyncio.sleep(0)
        __wb_check_stop()

async def __wb_sleep(seconds=0):
    end = time.time() + float(seconds)
    while True:
        __wb_check_stop()
        remaining = end - time.time()
        if remaining <= 0:
            break
        await asyncio.sleep(min(0.05, remaining))
        __wb_check_stop()

class __WbTransform(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "print":
            return ast.Await(
                value=ast.Call(
                    func=ast.Name(id="__wb_print", ctx=ast.Load()),
                    args=node.args,
                    keywords=node.keywords,
                )
            )
        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "sleep"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "time"
        ):
            return ast.Await(
                value=ast.Call(
                    func=ast.Name(id="__wb_sleep", ctx=ast.Load()),
                    args=node.args,
                    keywords=node.keywords,
                )
            )
        return node

def __wb_trace(frame, event, arg):
    if event == "line":
        __wb_check_stop()
    return __wb_trace

tree = ast.parse(__wb_user_src)
tree = __WbTransform().visit(tree)
ast.fix_missing_locations(tree)
body = tree.body if tree.body else [ast.Pass()]
main = ast.AsyncFunctionDef(
    name="__wb_main",
    args=ast.arguments(
        posonlyargs=[],
        args=[],
        vararg=None,
        kwonlyargs=[],
        kw_defaults=[],
        kwarg=None,
        defaults=[],
    ),
    body=body,
    decorator_list=[],
    returns=None,
    type_comment=None,
    type_params=[],
)
mod = ast.Module(
    body=[
        main,
        ast.Expr(
            value=ast.Await(
                value=ast.Call(
                    func=ast.Name(id="__wb_main", ctx=ast.Load()),
                    args=[],
                    keywords=[],
                )
            )
        ),
    ],
    type_ignores=[],
)
ast.fix_missing_locations(mod)
ast.unparse(mod)
`

export type RunPythonOptions = {
  onOutput?: (output: string) => void
  onStatus?: (status: string) => void
}

export async function runPython(
  code: string,
  options: RunPythonOptions = {},
): Promise<string> {
  const { onOutput, onStatus } = options

  if (running) {
    throw new Error('Уже выполняется другой код')
  }

  shouldStop = false
  running = true
  window.__wbShouldStop = () => shouldStop

  onStatus?.('Загрузка Pyodide…')
  const pyodide = await getPyodide()
  onStatus?.('Выполнение…')

  let output = ''
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let dirty = false

  const flush = (immediate = false) => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (!dirty && !immediate) return
    dirty = false
    onOutput?.(output)
  }

  const publish = (next: string, immediate = false) => {
    output = next
    dirty = true
    if (immediate) {
      flush(true)
      return
    }
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => flush(true), UI_FLUSH_MS)
  }

  const handleChunk = (text: string) => {
    publish(appendOutput(output, text))
  }

  pyodide.setStdout({ batched: handleChunk })
  pyodide.setStderr({ batched: handleChunk })
  publish('', true)

  try {
    pyodide.globals.set('__wb_user_src', code)
    const transformed = String(await pyodide.runPythonAsync(BOOTSTRAP))

    const prelude = `
import asyncio
import builtins
import sys
import time
from js import __wbShouldStop

_real_print = builtins.print
_print_n = 0
_print_last = time.time()

def __wb_check_stop():
    if __wbShouldStop():
        raise KeyboardInterrupt("Остановлено")

async def __wb_print(*args, **kwargs):
    global _print_n, _print_last
    _real_print(*args, **kwargs)
    try:
        sys.stdout.flush()
    except Exception:
        pass
    __wb_check_stop()
    _print_n += 1
    now = time.time()
    if _print_n >= 24 or (now - _print_last) >= 0.05:
        _print_n = 0
        _print_last = now
        await asyncio.sleep(0)
        __wb_check_stop()

async def __wb_sleep(seconds=0):
    end = time.time() + float(seconds)
    while True:
        __wb_check_stop()
        remaining = end - time.time()
        if remaining <= 0:
            break
        await asyncio.sleep(min(0.05, remaining))
        __wb_check_stop()

def __wb_trace(frame, event, arg):
    if event == "line":
        __wb_check_stop()
    return __wb_trace

sys.settrace(__wb_trace)
`

    const epilogue = `
sys.settrace(None)
`

    try {
      const result = await pyodide.runPythonAsync(
        `${prelude}\n${transformed}\n${epilogue}`,
      )
      if (
        result !== undefined &&
        result !== null &&
        String(result) !== 'undefined'
      ) {
        publish(appendOutput(output, String(result)), true)
      } else {
        publish(output, true)
      }
    } finally {
      try {
        await pyodide.runPythonAsync('import sys\nsys.settrace(None)')
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stopped = shouldStop || /KeyboardInterrupt|Остановлено/i.test(message)
    if (stopped) {
      publish(appendOutput(output, '\n⏹ Остановлено'), true)
    } else {
      publish(appendOutput(output, message), true)
    }
  } finally {
    running = false
    shouldStop = false
    if (flushTimer !== null) clearTimeout(flushTimer)
  }

  const finalOutput = output.trim() || '(нет вывода)'
  if (finalOutput !== output) {
    publish(finalOutput, true)
  }
  return finalOutput
}
