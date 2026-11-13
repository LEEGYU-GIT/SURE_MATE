// Headless Chrome over the DevTools protocol pipe (--remote-debugging-pipe: no TCP port is opened), and a small static
// file server on 127.0.0.1. No npm packages: Node 22 and a Chrome/Edge binary are enough.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
]

export function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p))
  if (!found) throw new Error('Chrome(또는 Edge)를 찾지 못했어요. CHROME 환경 변수에 실행 파일 경로를 넣어 주세요.')
  return found
}

export async function launchChrome({ userDataDir, chrome = findChrome() }) {
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      // GPU를 쓰지 않는다(공용 서버의 GPU를 건드리지 않게, 프레임마다 같은 그림이 나오게)
      '--disable-gpu',
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-extensions',
      '--disable-component-update',
      '--no-service-autorun',
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }
  )
  let stderr = ''
  proc.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)))
  const out = proc.stdio[3]
  const inp = proc.stdio[4]
  let nextId = 1
  const pending = new Map()
  const listeners = new Set()
  let chunks = []
  inp.on('data', (data) => {
    let start = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) continue
      chunks.push(data.subarray(start, i))
      const msg = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      chunks = []
      start = i + 1
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject, method } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
        else resolve(msg.result)
      } else {
        for (const l of listeners) l(msg)
      }
    }
    if (start < data.length) chunks.push(data.subarray(start))
  })
  const exited = new Promise((resolve) => proc.on('exit', resolve))
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject, method })
      const msg = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      out.write(JSON.stringify(msg) + '\0')
    })
  const waitEvent = (method, sessionId, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(l)
        reject(new Error(`timeout waiting ${method}`))
      }, timeoutMs)
      const l = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          clearTimeout(timer)
          listeners.delete(l)
          resolve(msg.params)
        }
      }
      listeners.add(l)
    })
  const { targetInfos } = await send('Target.getTargets')
  const page = targetInfos.find((t) => t.type === 'page')
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
  const s = (method, params) => send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  const consoleErrors = []
  listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  let initScript = null
  return {
    send: s,
    consoleErrors,
    async viewport(width, height, deviceScaleFactor = 1) {
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false })
    },
    async transparent(on) {
      await s('Emulation.setDefaultBackgroundColorOverride', on ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {})
    },
    /** 다음 문서부터 페이지 스크립트보다 먼저 실행할 스크립트(이전 것은 지운다) */
    async initScript(source) {
      if (initScript) await s('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript })
      initScript = source ? (await s('Page.addScriptToEvaluateOnNewDocument', { source })).identifier : null
    },
    async goto(url) {
      const loaded = waitEvent('Page.loadEventFired', sessionId)
      await s('Page.navigate', { url })
      await loaded
    },
    async eval(expression) {
      const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    },
    async shot({ clip, format = 'png', quality } = {}) {
      const r = await s('Page.captureScreenshot', {
        format,
        ...(quality ? { quality } : {}),
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
        captureBeyondViewport: false,
        optimizeForSpeed: format !== 'png'
      })
      return Buffer.from(r.data, 'base64')
    },
    async close() {
      try {
        await send('Browser.close')
      } catch {
        proc.kill()
      }
      await exited
    },
    stderr: () => stderr
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
}

/** 127.0.0.1의 임의 포트에서 폴더를 내보낸다. roots: { '/경로/': 폴더 } (긴 경로부터 맞춘다) */
export async function serveStatic(roots) {
  const prefixes = Object.keys(roots).sort((a, b) => b.length - a.length)
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const prefix = prefixes.find((p) => url.startsWith(p))
      if (!prefix) throw new Error('no root')
      const rel = normalize(url.slice(prefix.length)).replace(/^(\.\.([/\\]|$))+/, '')
      const file = join(roots[prefix], rel || 'index.html')
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}
