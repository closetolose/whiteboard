import { PYTHON_SANDBOX_HTML } from './pythonSandbox'

export type RunPythonOptions = {
  onOutput?: (output: string) => void
  onStatus?: (status: string) => void
  signal?: AbortSignal
}

let activeStop: (() => void) | null = null

export function stopPython() {
  activeStop?.()
}

export function isPythonRunning() {
  return activeStop !== null
}

export async function runPython(code: string, options: RunPythonOptions = {}): Promise<string> {
  if (activeStop) throw new Error('Уже выполняется другой код')
  if (options.signal?.aborted) return '⏹ Остановлено'

  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-scripts')
  frame.hidden = true
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = PYTHON_SANDBOX_HTML
  const channel = new MessageChannel()
  let output = ''
  let began = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let stopTimeout: ReturnType<typeof setTimeout> | undefined
  let finish: (output: string) => void = () => {}
  const completed = new Promise<string>((resolve) => { finish = resolve })
  const stop = () => {
    channel.port1.postMessage({ type: 'stop' })
    stopTimeout ??= setTimeout(() => finish(`${output}\n⏹ Остановлено`), 500)
  }
  activeStop = stop
  const armTimeout = () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      channel.port1.postMessage({ type: 'stop' })
      finish(`${output}\nПревышено время выполнения (60 секунд)`)
    }, 60_000)
  }

  try {
    options.signal?.addEventListener('abort', stop, { once: true })
    options.onStatus?.('Загрузка Pyodide…')
    channel.port1.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return
      if (data.type === 'ready') {
        channel.port1.postMessage({ type: 'run', code })
      } else if (data.type === 'status' && data.status === 'running' && !began) {
        began = true
        options.onStatus?.('Выполнение…')
        armTimeout()
      } else if ((data.type === 'output' || data.type === 'done') && typeof data.output === 'string') {
        output = data.output.slice(-120_000)
        options.onOutput?.(output)
        if (data.type === 'done') finish(output)
      }
    }
    frame.onload = () => {
      frame.contentWindow?.postMessage('python:init', '*', [channel.port2])
    }
    frame.onerror = () => finish('Не удалось загрузить среду Python. Повторите запуск.')
    armTimeout()
    document.body.appendChild(frame)
    return await completed
  } finally {
    clearTimeout(timeout)
    clearTimeout(stopTimeout)
    options.signal?.removeEventListener('abort', stop)
    channel.port1.close()
    channel.port2.close()
    frame.remove()
    activeStop = null
  }
}
