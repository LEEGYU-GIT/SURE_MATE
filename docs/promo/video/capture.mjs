// Captures the real Sure-Mate screens for the video: the renderer's preview build (desktop/src/renderer/src/preview) draws
// the actual React components with a fake API; we feed that fake API the scenario from fixtures.mjs and photograph
// each state at 2-3x with a transparent background. Output: .cache/ui/*.png and .cache/ui/manifest.json.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchChrome, serveStatic } from './lib/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DESKTOP = join(HERE, '../../../desktop')
const CACHE = join(HERE, '.cache')
const UI = join(CACHE, 'ui')
const DIST = join(CACHE, 'preview-dist')
const args = new Set(process.argv.slice(2))
const fx = JSON.parse(readFileSync(join(CACHE, 'fixtures.json'), 'utf8'))

if (args.has('--build') || !existsSync(join(DIST, 'preview.html'))) {
  execFileSync(
    process.execPath,
    [join(DESKTOP, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.preview.config.ts', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: DESKTOP, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } }
  )
}

// 미리 보기 전용 바탕(가짜 바탕화면 그라데이션·흰 문서 창·작업 표시줄)은 지우고 앱 화면만 남긴다
const CLEAR_CSS = `
html, body, #root { background: transparent !important; }
#root [style*="linear-gradient"] { background: transparent !important; }
#root [style*="rgb(247, 248, 250)"], #root [style*="rgba(15, 18, 28"] { visibility: hidden !important; }
`
const HIDE_BAR_CSS = `#root [role="toolbar"] { visibility: hidden !important; }`

/** 가짜 API(window.sureMate)가 설치되는 순간 장면 데이터를 이 영상의 시나리오로 바꾼다 */
function initScript(patch, css) {
  return `(() => {
    const patch = ${JSON.stringify(patch)};
    let api;
    Object.defineProperty(window, 'sureMate', {
      configurable: true,
      get() { return api; },
      set(v) {
        api = v;
        if (!v) return;
        if (patch.items) v.listItems = async () => patch.items;
        if (patch.status) v.getStatus = async () => patch.status;
        if (patch.search) {
          const original = v.getSearchContext;
          v.getSearchContext = async () => ({ ...(await original()), learned: [], usage: patch.search.usage, now: patch.search.now });
        }
        if (patch.shown) v.onShown = (cb) => { const t = setTimeout(() => cb(patch.shown), 0); return () => clearTimeout(t); };
        if (patch.preview) v.previewPrompt = async () => patch.preview;
        if (patch.bubble) {
          const original = v.getPetView;
          // 말풍선은 처음 그릴 때 크기를 잰다. 미리 보기는 글꼴을 받기 전에 그려 대체 글꼴로 재므로(꼬리가 떨어진다),
          // 앱처럼 글꼴이 준비된 뒤에 펫 상태를 건넨다
          v.getPetView = async () => {
            await Promise.all(['400 13px "Pretendard Variable"', '600 13px "Pretendard Variable"'].map((f) => document.fonts.load(f, '가A')));
            await document.fonts.ready;
            const view = await original();
            if (view && view.bubble) view.bubble = { ...view.bubble, text: patch.bubble };
            return view;
          };
        }
      }
    });
    // 이 스크립트는 문서가 만들어지기 전에 돈다: 문서가 생긴 뒤에 스타일을 붙인다
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);
    }, { once: true });
  })();`
}

const NOW = Date.parse('2026-11-16T09:00:00+09:00')
const paletteBase = {
  items: fx.palette.items,
  status: fx.palette.status,
  search: { usage: fx.palette.usage, now: NOW }
}
const jobs = []
const palette = (name, query) =>
  jobs.push({ name, scene: 'palette-natural-prompt', size: [720, 460], dpr: 2, patch: { ...paletteBase, shown: { mode: 'search', query } }, parts: { win: ':viewport' } })
palette('palette-empty', '')
for (const [seq, states] of Object.entries(fx.palette.typing)) states.forEach((q, i) => palette(`palette-${seq}-${i}`, q))
jobs.push({
  name: 'confirm',
  scene: 'confirm-seen',
  size: [720, 460],
  dpr: 2,
  settle: 1600,
  patch: { ...paletteBase, shown: { mode: 'confirm', draft: fx.confirm.draft }, preview: fx.confirm.preview },
  parts: { win: ':viewport' },
  marks: true
})
jobs.push({ name: 'bar', scene: 'bar-edge-right', size: [640, 600], dpr: 2, patch: {}, parts: { bar: '[role="toolbar"]' } })
jobs.push({ name: 'card', scene: 'card-best', size: [640, 600], dpr: 2, patch: {}, parts: { card: '[data-flyout-window]' }, refs: { bar: '[role="toolbar"]', item: '[aria-label="용어 사전에서 찾기"]', root: '[data-card-root]' } })
const pet = (name, scene, o = {}) =>
  jobs.push({ name, scene, size: [640, 600], dpr: 3, hideBar: true, patch: o.bubble ? { bubble: o.bubble } : {}, parts: { sprite: 'svg.pet-sprite', ...(o.withBubble ? { bubble: '.pet-bubble' } : {}) }, hideFor: { sprite: '.pet-bubble', bubble: 'svg.pet-sprite' }, refs: { bar: '[role="toolbar"]' } })
pet('pet-stand', 'pet-sunglasses')
pet('pet-sit', 'pet-sunglasses-sit')
pet('pet-sleep', 'pet-sleep')
pet('pet-copied', 'pet-celebrate-sunglasses', { withBubble: true, bubble: fx.bubbles.copied })
pet('pet-unmask', 'pet-unmask', { withBubble: true, bubble: fx.bubbles.unmasked })
pet('pet-nudge', 'pet-nudge', { withBubble: true, bubble: fx.bubbles.nudge })

const only = process.argv.slice(2).find((a) => a.startsWith('--only='))?.slice(7)
const todo = only ? jobs.filter((j) => j.name.startsWith(only)) : jobs
if (!only) rmSync(UI, { recursive: true, force: true })
mkdirSync(UI, { recursive: true })
const manifestPath = join(UI, 'manifest.json')
const manifest = only && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}

const srv = await serveStatic({ '/': DIST })
const chrome = await launchChrome({ userDataDir: join(CACHE, 'chrome-capture') })
try {
  await chrome.transparent(true)
  for (const job of todo) {
    const [w, h] = job.size
    await chrome.viewport(w, h, job.dpr)
    await chrome.initScript(initScript(job.patch, CLEAR_CSS + (job.hideBar ? HIDE_BAR_CSS : '')))
    await chrome.goto(`${srv.origin}/preview.html?job=${encodeURIComponent(job.name)}#${job.scene}`)
    await chrome.eval(`document.fonts.ready.then(() => new Promise((r) => setTimeout(r, ${job.settle ?? 900})))`)
    // 움직임은 끝난 모습으로(말풍선이 다 열리고 폴짝이 내려앉은 뒤), 반복 움직임(숨쉬기·깜빡임)은 처음 모습으로 멈춘다
    await chrome.eval(`(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getComputedTiming(); if (t && t.endTime === Infinity) { a.pause(); a.currentTime = 0 } else { try { a.finish() } catch { a.pause() } } } })()`)
    await chrome.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`)
    const rects = await chrome.eval(`(() => {
      const rect = (sel) => {
        if (sel === ':viewport') return { x: 0, y: 0, width: innerWidth, height: innerHeight };
        const els = [...document.querySelectorAll(sel)];
        if (!els.length) return null;
        const r = els[0].getBoundingClientRect();
        let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
        // 말풍선 꼬리는 상자 밖으로 나온다
        for (const t of els[0].querySelectorAll('.pet-bubble-tail')) { const q = t.getBoundingClientRect(); x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      };
      const parts = ${JSON.stringify(job.parts)}, refs = ${JSON.stringify(job.refs ?? {})};
      const out = { parts: {}, refs: {} };
      for (const [k, s] of Object.entries(parts)) out.parts[k] = rect(s);
      for (const [k, s] of Object.entries(refs)) out.refs[k] = rect(s);
      ${job.marks ? `out.marks = [...document.querySelectorAll('mark')].slice(0, 12).map((m) => { const r = m.getBoundingClientRect(); return { text: m.textContent, x: r.x, y: r.y, width: r.width, height: r.height } });
      const union = (els) => { const rs = els.map((e) => e.getBoundingClientRect()); if (!rs.length) return null; const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top)); return { x: x0, y: y0, width: Math.max(...rs.map((r) => r.right)) - x0, height: Math.max(...rs.map((r) => r.bottom)) - y0 } };
      out.chips = union([...document.querySelectorAll('button')].filter((b) => b.textContent.includes('→')));
      const box = document.querySelector('mark')?.closest('[class*="overflow"]');
      out.previewBox = box ? union([box]) : null;` : ''}
      return out;
    })()`)
    const entry = { scene: job.scene, dpr: job.dpr, viewport: { width: w, height: h }, refs: rects.refs, parts: {}, ...(rects.marks ? { marks: rects.marks, chips: rects.chips, previewBox: rects.previewBox } : {}) }
    for (const [part, r] of Object.entries(rects.parts)) {
      if (!r) throw new Error(`${job.name}: ${job.parts[part]}를 찾지 못했어요`)
      // 펫과 말풍선은 겹치므로 한 장씩: 찍는 부분이 아닌 쪽은 잠시 숨긴다
      if (job.hideFor?.[part]) {
        await chrome.eval(`(() => { for (const el of document.querySelectorAll('[data-video-hidden]')) { el.style.visibility = ''; el.removeAttribute('data-video-hidden') } for (const el of document.querySelectorAll(${JSON.stringify(job.hideFor[part])})) { el.style.visibility = 'hidden'; el.setAttribute('data-video-hidden', '') } })()`)
        await chrome.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`)
      }
      // 그림자·소품(편지·z)이 상자 밖으로 나오므로 여유를 두고 자른다(바깥은 투명)
      const pad = part === 'sprite' ? 28 : part === 'bubble' ? 6 : part === 'bar' ? 0 : 0
      const clip = {
        x: Math.max(0, Math.floor(r.x - pad)),
        y: Math.max(0, Math.floor(r.y - pad)),
        width: Math.min(w, Math.ceil(r.x + r.width + pad)) - Math.max(0, Math.floor(r.x - pad)),
        height: Math.min(h, Math.ceil(r.y + r.height + pad)) - Math.max(0, Math.floor(r.y - pad))
      }
      const file = `${job.name}${part === 'win' ? '' : `-${part}`}.png`
      writeFileSync(join(UI, file), await chrome.shot({ clip }))
      entry.parts[part] = { file, clip, box: r }
    }
    manifest[job.name] = entry
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  if (chrome.consoleErrors.length) console.warn('page errors:\n' + [...new Set(chrome.consoleErrors)].slice(0, 8).join('\n'))
} finally {
  await chrome.close()
  srv.close()
}
manifest.layout = await desktopLayout(manifest)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`capture: ${todo.length} screens → ${UI}`)

/**
 * 영상 속 바탕화면(1600×900, 작업 표시줄 48)에서 Sure-Mate 창이 놓일 자리: 앱과 같은 계산(palettePosition·barRect·flyoutCardRect)을 쓴다.
 * 펫과 말풍선은 미리 보기 장면에서 잰 상대 위치(바닥·바 꼭대기 기준)를 그대로 옮긴다
 */
async function desktopLayout(m) {
  const app = (path) => import(pathToFileURL(join(DESKTOP, path)).href)
  const { palettePosition } = await app('src/shared/palette-rules.ts')
  const { barRect, DEFAULT_BAR_RATIO } = await app('src/shared/bar/bar-layout.ts')
  const { flyoutCardRect, flyoutWindowRect } = await app('src/main/flyout/flyout-placement.ts')
  const screen = { width: 1600, height: 900, taskbar: 48 }
  const workArea = { x: 0, y: 0, width: screen.width, height: screen.height - screen.taskbar }
  const barBox = m.bar.parts.bar.box
  const bar = barRect({ workArea, shape: 'edge', edge: 'right', size: { width: barBox.width, height: barBox.height }, ratio: DEFAULT_BAR_RATIO })
  const c = m.card.refs
  const anchor = { x: bar.x, y: bar.y + (c.item.y - c.bar.y), width: bar.width, height: c.item.height }
  const card = flyoutCardRect({ size: { width: c.root.width, height: c.root.height }, anchor, bar, edge: 'right', workArea, align: 'top' })
  const cardWindow = flyoutWindowRect(card, 'right', workArea).window
  // 미리 보기 장면의 작업 영역 바닥(640×600 바탕화면, 작업 표시줄 26)
  const previewFloor = 574
  const stand = m['pet-stand'].parts.sprite.box
  const sit = m['pet-sit']
  return {
    screen,
    workArea,
    palette: palettePosition(workArea, { width: 720, height: 460 }),
    bar,
    cardWindow,
    pet: {
      size: stand.width,
      /** 바닥에 선 펫 그림 상자의 위쪽 = 바닥 + 이 값 */
      floorTop: stand.y - previewFloor,
      /** 바 꼭대기에 앉은 펫 그림 상자 = 바 왼쪽·위 + 이 값 */
      sit: { dx: sit.parts.sprite.box.x - sit.refs.bar.x, dy: sit.parts.sprite.box.y - sit.refs.bar.y }
    }
  }
}
