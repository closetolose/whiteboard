import workerSource from './python.worker.js?raw'

const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/'
// Blob workers inherit this policy. The iframe deliberately has an opaque origin.
const CSP = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: ${CDN}; connect-src ${CDN}; worker-src blob:; child-src blob:; base-uri 'none'; form-action 'none'`

export const PYTHON_SANDBOX_HTML = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<script>
addEventListener('message', function initialize(event) {
  if (event.source !== parent || event.data !== 'python:init' || !event.ports[0]) return;
  removeEventListener('message', initialize);
  const port = event.ports[0];
  let worker;
  let lastOutput = '';
  let lastPublish = 0;
  function finish(output) {
    worker?.terminate();
    port.postMessage({ type: 'done', output });
  }
  try {
    const source = ${JSON.stringify(workerSource).replace(/</g, '\\u003c')};
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return;
      if ((data.type === 'output' || data.type === 'done') && typeof data.output === 'string') {
        lastOutput = data.output.slice(-120000);
        if (data.type === 'done' || performance.now() - lastPublish >= 50) {
          lastPublish = performance.now();
          port.postMessage({ type: data.type, output: lastOutput });
        }
      } else if (data.type === 'status' && data.status === 'running') {
        port.postMessage({ type: 'status', status: 'running' });
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(event.message || 'Не удалось запустить Python');
    };
    port.onmessage = ({ data }) => {
      if (data?.type === 'run' && typeof data.code === 'string') worker.postMessage({ code: data.code });
      if (data?.type === 'stop') finish(lastOutput + '\\n⏹ Остановлено');
    };
    port.postMessage({ type: 'ready' });
  } catch (error) {
    finish(String(error));
  }
});
</script>`
