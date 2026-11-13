// 게시글 시안(sure-mate-promo.html)을 게시판용 PNG로 나눠 뽑는다. data-slice가 붙은 칸에서 다음 data-slice 칸 앞까지가 한 장이다.
// 실행(README.md): ELECTRON_RUN_AS_NODE를 지운 셸에서
//   desktop/node_modules/electron/dist/electron.exe docs/promo/export.cjs [--theme light|dark] [--scales 1,2] [--out docs/promo/images]
// 폭은 760 CSS 픽셀이다. 배율 2는 같은 크기를 두 배 해상도로 뽑아 파일 이름 뒤에 @2x를 붙인다.
// 글꼴은 Google Fonts에서 받으므로 인터넷이 필요하다. 움직임은 끄고(prefers-reduced-motion) 첫 프레임 그대로 찍는다.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const WIDTH = 760

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const here = __dirname
const source = path.join(here, 'sure-mate-promo.html')
const theme = option('theme', 'light')
const scales = option('scales', '1,2').split(',').map(Number).filter((n) => n > 0)
const outDir = path.resolve(option('out', path.join(here, 'images')))

app.disableHardwareAcceleration()

const started = Date.now()
// 진행 기록은 파일에도 남긴다(Electron 주 프로세스의 표준 출력은 셸에 따라 보이지 않는다)
const stepLog = path.join(require('node:os').tmpdir(), 'sure-mate-promo-export.log')
fs.writeFileSync(stepLog, '')
const step = (m) => {
  const line = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${m}`
  console.log(line)
  fs.appendFileSync(stepLog, line + '\n')
}
// 어느 단계에서 멈추면 그 단계를 알리고 끝낸다(글꼴을 못 받거나 캡처가 돌아오지 않을 때)
setTimeout(() => {
  console.error('timed out after 90 s')
  app.exit(2)
}, 90_000).unref()

app.whenReady().then(async () => {
  let code = 0
  // 시안 파일은 Artifact 게시용이라 <html>·<head>가 없다. 문서 틀·문자 집합·테마·export 표시를 붙인 임시 파일로 연다
  const body = fs.readFileSync(source, 'utf8')
  const temp = path.join(here, '.export-temp.html')
  fs.writeFileSync(
    temp,
    // 스크롤바를 숨겨 쟤는 폭과 찍는 폭이 같게 한다(스크롤바 폭만큼 줄을 다르게 바꾸면 칸 경계가 어긋난다)
    `<!doctype html><html lang="ko" class="export" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=${WIDTH}"><style>html,body{margin:0}::-webkit-scrollbar{display:none}</style></head><body>${body}</body></html>`
  )
  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: 900,
    useContentSize: true,
    // 화면에 띄우지 않고 그린다(숨긴 보통 창은 프레임을 만들지 않아 캡처가 돌아오지 않는다)
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, spellcheck: false, backgroundThrottling: false }
  })
  step('window created')
  try {
    const wc = win.webContents
    step('load')
    await win.loadFile(temp)
    // 페이지를 연 뒤에 붙는다(연 페이지가 없으면 렌더러가 없어 명령이 돌아오지 않는다). 움직임을 끄면 첫 등장 움직임도 끝난 모습이 된다
    wc.debugger.attach('1.3')
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: theme }
      ]
    })
    step('fonts')
    // 글꼴을 다 받을 때까지 기다린다(한 번 더 기다려 늦게 쓰인 글꼴까지)
    await wc.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 600))).then(() => document.fonts.ready).then(() => true)')
    step('measure')
    const fonts = await wc.executeJavaScript(
      "[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/\"/g, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ')"
    )
    const measure = () =>
      wc.executeJavaScript(`(() => {
        const starts = [...document.querySelectorAll('#panel-page [data-slice]')]
        const end = Math.ceil(document.getElementById('panel-page').getBoundingClientRect().bottom + scrollY)
        // 칸 경계가 소수 픽셀이면 경계 줄은 두 칸 색이 섞여 그려진다. 그 줄은 어느 장에도 넣지 않는다(위는 올림, 아래는 내림)
        return { end, slices: starts.map((el, i) => ({
          name: el.dataset.slice,
          top: Math.ceil(el.getBoundingClientRect().top + scrollY),
          bottom: i + 1 < starts.length ? Math.floor(starts[i + 1].getBoundingClientRect().top + scrollY) : Math.floor(document.getElementById('panel-page').getBoundingClientRect().bottom + scrollY)
        })) }
      })()`)
    const settle = () => new Promise((r) => setTimeout(r, 300))
    fs.mkdirSync(outDir, { recursive: true })
    const written = []
    for (const scale of scales) {
      // 찍을 크기(폭 760, 높이는 글 전체)로 맞춘 뒤 다시 잰다. 높이가 바뀌면 한 번 더 맞춘다
      let page = await measure()
      for (let i = 0; i < 3; i++) {
        await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: page.end, deviceScaleFactor: scale, mobile: false })
        await settle()
        const again = await measure()
        const same = again.end === page.end
        page = again
        if (same) break
      }
      for (const s of page.slices) {
        step(`capture ${s.name} x${scale}`)
        const { data } = await wc.debugger.sendCommand('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: s.top, width: WIDTH, height: s.bottom - s.top, scale: 1 },
          captureBeyondViewport: true
        })
        const suffix = theme === 'light' ? '' : `-${theme}`
        const file = path.join(outDir, `${s.name}${suffix}${scale === 1 ? '' : `@${scale}x`}.png`)
        fs.writeFileSync(file, Buffer.from(data, 'base64'))
        written.push(`${path.basename(file)} ${WIDTH * scale}x${(s.bottom - s.top) * scale}`)
      }
    }
    step(`fonts: ${fonts}`)
    step(`written:\n${written.join('\n')}`)
  } catch (e) {
    console.error(e)
    step(`error: ${e && e.stack ? e.stack : e}`)
    code = 1
  } finally {
    fs.rmSync(temp, { force: true })
    app.exit(code)
  }
})
