// Renders scene/index.html frame by frame (window.__render(t) → screenshot) and pipes the frames to ffmpeg.
//   node render.mjs                      → .cache/video.mp4 (영상만) + .cache/cues.json (효과음 시각)
//   node render.mjs --stills=3.5,20.1    → .cache/stills/still-3.50.png … (장면 확인용)
//   node render.mjs --from=18 --to=35    → 일부 구간만
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, serveStatic } from './lib/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../../..')
const CACHE = join(HERE, '.cache')
const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const fps = Number(opt.fps ?? 30)
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'

const srv = await serveStatic({ '/': REPO })
const chrome = await launchChrome({ userDataDir: join(CACHE, 'chrome-render') })
try {
  await chrome.viewport(1920, 1080, Number(opt.scale ?? 1))
  await chrome.goto(`${srv.origin}/docs/promo/video/scene/index.html?render`)
  const ok = await chrome.eval(`(async () => {
    for (let i = 0; i < 600 && !window.__ready; i++) await new Promise((r) => setTimeout(r, 50));
    await document.fonts.ready;
    return { ready: Boolean(window.__ready), jua: document.fonts.check('48px Jua'), mono: document.fonts.check('600 28px "IBM Plex Mono"'), pretendard: document.fonts.check('16px "Pretendard Variable"'), duration: window.__duration };
  })()`)
  if (!ok.ready) throw new Error('scene not ready: ' + chrome.consoleErrors.join(' | '))
  if (!ok.jua || !ok.mono || !ok.pretendard) throw new Error(`글꼴을 받지 못했어요(인터넷 연결 확인): ${JSON.stringify(ok)}`)
  if (chrome.consoleErrors.length) console.warn('page errors:', chrome.consoleErrors.slice(0, 5).join(' | '))

  const frameAt = async (t) => {
    await chrome.eval(`(window.__render(${t}), new Promise((r) => requestAnimationFrame(() => r())))`)
    return chrome.shot({ format: 'png' })
  }

  if (opt.stills) {
    const dir = join(CACHE, 'stills')
    mkdirSync(dir, { recursive: true })
    for (const t of String(opt.stills).split(',').map(Number)) {
      writeFileSync(join(dir, `still-${t.toFixed(2)}.png`), await frameAt(t))
      process.stdout.write(`still ${t}\n`)
    }
  } else {
    const cues = await chrome.eval('window.__cues')
    writeFileSync(join(CACHE, 'cues.json'), JSON.stringify({ duration: ok.duration, cues }, null, 1))
    if (opt['cues-only']) process.exit(0)
    const from = Number(opt.from ?? 0)
    const to = Math.min(Number(opt.to ?? ok.duration), ok.duration)
    const frames = Math.round((to - from) * fps)
    const out = opt.out ? join(HERE, String(opt.out)) : join(CACHE, 'video.mp4')
    const ff = spawn(
      ffmpeg,
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'inherit', 'inherit'] }
    )
    const done = new Promise((resolve, reject) => ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))))
    const started = Date.now()
    for (let i = 0; i < frames; i++) {
      const png = await frameAt(from + i / fps)
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r))
      if (i % fps === 0) process.stdout.write(`\r${(from + i / fps).toFixed(0)}s / ${to.toFixed(0)}s  (${((Date.now() - started) / 1000).toFixed(0)}s 걸림)`)
    }
    ff.stdin.end()
    await done
    process.stdout.write(`\nvideo: ${frames} frames → ${out}\n`)
  }
} finally {
  await chrome.close()
  srv.close()
}
