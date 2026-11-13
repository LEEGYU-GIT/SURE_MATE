// 게시글 시안(sure-mate-promo.html) 첫째 탭을 사내 게시판에 그대로 붙여넣을 수 있는 HTML(board/post-design.html)로 바꾼다.
// 게시판 편집기는 <style>·<script>·<link>·클래스를 지우는 경우가 많아서, 브라우저가 계산한 모양을 요소마다 style=""로 옮겨 적는다.
//   - 폭·높이·가운데 맞춤(margin auto)·그리드 칸·위치는 시안 CSS에 적힌 값만 쓴다. 계산한 픽셀 값(특히 그리드 줄 높이)을 적으면
//     게시판에서 글꼴이 바뀌어 줄이 늘 때 글이 위아래로 겹친다(11/13 게시 때 첫 화면·마무리 칸에서 겹쳤다)
//   - 게시판은 <link>를 지워 웹 글꼴(Jua·IBM Plex)이 안 불러와지고 맑은 고딕으로 보인다. 그래서 Jua 제목은 굵게(700) 적고,
//     Jua가 불러와질 때는 font-synthesis:none으로 가짜 굵기를 막는다. em의 기울임 여부도 늘 적는다(게시판 기본은 기울임)
//   - ::before/::after(Q./A. 머리, 말풍선 꼬리 등)는 진짜 <span>으로 바꾸고, 말랑 메이트 SVG의 <use>는 그림을 펼쳐 넣는다
//   - 데모 단추처럼 게시판용 이미지에서 숨기는 것(.export 규칙)은 넣지 않는다. 움직임은 끄고 멈춘 모양을 적는다
// 실행: 저장소 루트에서 node docs/promo/board/inline.mjs [--video 영상링크 [--poster 대표이미지링크]] [--out 파일]
//   --video를 주면 글 맨 위에 영상 칸을 넣어 post-design-video.html로 쓴다(게시판 첨부 링크가 들어가므로 저장소에 올리지 않는다).
//   --poster를 안 주면 영상 대표 이미지(video/sure-mate-promo-poster.png)를 JPEG로 줄여 글 안에 넣는다
//   설치된 Chrome·Edge와 인터넷(Google Fonts) 필요
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROMO = join(HERE, '..')
const { launchChrome, serveStatic } = await import(pathToFileURL(join(PROMO, 'video/lib/cdp.mjs')).href)
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Jua&display=swap'
const option = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const VIDEO = option('video')
const POSTER = option('poster')
const OUT = resolvePath(option('out') ?? join(HERE, VIDEO ? 'post-design-video.html' : 'post-design.html'))

const temp = join(PROMO, '.inline-temp.html')
const body = readFileSync(join(PROMO, 'sure-mate-promo.html'), 'utf8')
const still = '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>'
writeFileSync(temp, `<!doctype html><html lang="ko" class="export" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=1100"><style>html,body{margin:0}</style></head><body>${body}${still}</body></html>`)

// 페이지 안에서 돈다: 첫째 탭을 줄 안 스타일만 가진 HTML 문자열로
const INLINE = String.raw`(async () => {
  await document.fonts.ready
  const SVG = 'http://www.w3.org/2000/svg'
  const page = document.getElementById('panel-page')
  // 1. <use href="#mate-…">를 그 그림으로 펼친다(원본 DOM에서: 시안 CSS가 채우기·선 색을 정하게)
  const expand = (root) => {
    for (const u of [...root.querySelectorAll('use')]) {
      const id = (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^#/, '')
      const src = document.getElementById(id)
      if (!src) continue
      const g = document.createElementNS(SVG, 'g')
      for (const ch of src.childNodes) g.appendChild(ch.cloneNode(true))
      for (const a of ['x', 'y', 'transform']) if (u.hasAttribute(a)) g.setAttribute(a, u.getAttribute(a))
      u.replaceWith(g)
      expand(g)
    }
  }
  expand(page)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  // 2. 글쓴 값을 찾을 규칙(지금 화면에 맞는 미디어 쿼리 안의 규칙까지, 나온 순서대로 뒤의 것이 이긴다).
  //    선택자 목록은 쉼표로 나누고, ::before/::after로 끝나는 선택자는 그 의사 요소에만 맞춘다
  const splitSel = (text) => {
    const out = []
    let depth = 0, cur = ''
    for (const ch of text) {
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
    return out.map((sel) => {
      const m = sel.match(/::?(before|after)$/)
      const base = m ? sel.slice(0, m.index).trim() : sel
      return { pseudo: m ? '::' + m[1] : '', base: base === '' || /[\s>+~]$/.test(base) ? base + '*' : base }
    })
  }
  const rules = []
  const collect = (list) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) rules.push({ style: r.style, sels: splitSel(r.selectorText) })
      else if (r instanceof CSSMediaRule) { if (matchMedia(r.media.mediaText).matches) collect(r.cssRules) }
      else if (r.cssRules) collect(r.cssRules)
    }
  }
  for (const sh of document.styleSheets) { try { collect(sh.cssRules) } catch {} }
  const matched = new WeakMap()
  const rulesFor = (el, pseudo) => {
    let m = matched.get(el)
    if (!m) { m = {}; matched.set(el, m) }
    if (!m[pseudo]) m[pseudo] = rules.filter((r) => r.sels.some((s) => { if (s.pseudo !== pseudo) return false; try { return el.matches(s.base) } catch { return false } }))
    return m[pseudo]
  }
  // var(--이름)은 그 요소의 계산한 사용자 속성 값으로, env(…, 기본값)은 기본값으로 바꾼다(게시판에는 시안의 :root 변수가 없다)
  const resolve = (el, v) => {
    let out = v
    for (let i = 0; i < 5 && /var\(|env\(/.test(out); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fb) => getComputedStyle(el).getPropertyValue(name).trim() || (fb ?? '').trim())
      out = out.replace(/env\(\s*[\w-]+\s*(?:,\s*([^()]*))?\)/g, (_, fb) => (fb ?? '0px').trim())
    }
    return /var\(|env\(/.test(out) ? null : out
  }
  const authoredOf = (el, prop, pseudo = '') => {
    const own = !pseudo && el.style ? el.style.getPropertyValue(prop) : ''
    if (own) return resolve(el, own)
    let found = null
    for (const r of rulesFor(el, pseudo)) { const v = r.style.getPropertyValue(prop); if (v) found = v }
    return found ? resolve(el, found) : null
  }
  const camel = (k) => k.replace(/-(\w)/g, (_, c) => c.toUpperCase())

  const css = (cs, el, parentCs, isSvg, pseudo = '') => {
    // 글쓴 값('auto'·'none'은 안 적은 것으로 본다)
    const authored = (e, k) => { const a = authoredOf(e, k, pseudo); return a && a !== 'auto' && a !== 'none' ? a : null }
    const out = []
    const put = (k, v) => { if (v !== null && v !== undefined && v !== '') out.push(k + ':' + v) }
    const display = cs.display
    put('display', display)
    put('box-sizing', cs.boxSizing)
    // 글자: 게시판 CSS가 글자 모양을 덮지 못하게 늘 적는다
    const jua = /^"?Jua\b/.test(cs.fontFamily)
    put('font-family', cs.fontFamily)
    put('font-size', cs.fontSize)
    put('font-weight', jua ? '700' : cs.fontWeight)
    if (jua) put('font-synthesis', 'none')
    put('font-style', cs.fontStyle)
    put('line-height', cs.lineHeight)
    if (cs.letterSpacing !== 'normal') put('letter-spacing', cs.letterSpacing)
    put('color', cs.color)
    if (cs.textAlign !== 'start') put('text-align', cs.textAlign)
    if (cs.whiteSpace !== 'normal') put('white-space', cs.whiteSpace)
    if (cs.wordBreak !== 'normal') put('word-break', cs.wordBreak)
    if (cs.overflowWrap !== 'normal') put('overflow-wrap', cs.overflowWrap)
    if (cs.textWrap && cs.textWrap !== 'wrap') put('text-wrap', cs.textWrap)
    if (cs.textTransform !== 'none') put('text-transform', cs.textTransform)
    if (cs.textDecorationLine !== 'none') put('text-decoration', cs.textDecorationLine + ' ' + cs.textDecorationColor)
    if (cs.fontVariantNumeric !== 'normal') put('font-variant-numeric', cs.fontVariantNumeric)
    if (cs.verticalAlign !== 'baseline') put('vertical-align', cs.verticalAlign)
    // 상자: 바깥·안쪽 여백은 늘 적는다(게시판 CSS가 p·h2·ul에 준 여백을 덮는다)
    const ml = authoredOf(el, 'margin-left', pseudo), mr = authoredOf(el, 'margin-right', pseudo)
    put('margin', [cs.marginTop, mr === 'auto' ? 'auto' : cs.marginRight, cs.marginBottom, ml === 'auto' ? 'auto' : cs.marginLeft].join(' '))
    put('padding', [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '))
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = cs['border' + side + 'Width'], s = cs['border' + side + 'Style']
      if (s !== 'none' && w !== '0px') put('border-' + side.toLowerCase(), w + ' ' + s + ' ' + cs['border' + side + 'Color'])
    }
    if (cs.borderTopLeftRadius !== '0px' || cs.borderTopRightRadius !== '0px' || cs.borderBottomLeftRadius !== '0px' || cs.borderBottomRightRadius !== '0px')
      put('border-radius', [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '))
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') put('background-color', cs.backgroundColor)
    if (cs.backgroundImage !== 'none') put('background-image', cs.backgroundImage)
    if (cs.boxShadow !== 'none') put('box-shadow', cs.boxShadow)
    if (cs.opacity !== '1') put('opacity', cs.opacity)
    if (cs.transform !== 'none') put('transform', authored(el, 'transform') ?? cs.transform)
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') put('overflow', cs.overflowX + ' ' + cs.overflowY)
    if (cs.position !== 'static') {
      put('position', cs.position)
      for (const k of ['top', 'right', 'bottom', 'left']) put(k, authored(el, k))
      if (cs.zIndex !== 'auto') put('z-index', cs.zIndex)
    }
    if (display.includes('list-item') || el.localName === 'ul' || el.localName === 'ol') put('list-style', cs.listStyleType + ' ' + cs.listStylePosition)
    // 크기: 시안 CSS에 적힌 값만(글자 폭이 달라져도 줄이 다시 맞게). ch는 글꼴마다 폭이 달라 시안에서 계산한 px로 적는다.
    // 의사 요소는 적힌 크기가 없고 떠 있는(absolute) 것만 계산한 크기를 쓴다(양쪽 끝이 다 적혀 있으면 늘어나게 둔다)
    for (const k of ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio']) {
      const a = authored(el, k)
      if (a) put(k, /\dch\b/.test(a) ? cs[camel(k)] : a)
    }
    if (pseudo && (cs.position === 'absolute' || cs.position === 'fixed')) {
      if (!authored(el, 'width') && !(authored(el, 'left') && authored(el, 'right'))) put('width', cs.width)
      if (!authored(el, 'height') && !(authored(el, 'top') && authored(el, 'bottom'))) put('height', cs.height)
    }
    // 펼침·격자 상자. 그리드 줄 높이는 적지 않는다(내용에 맞게 늘어야 글이 안 겹친다)
    if (display.includes('flex')) {
      put('flex-direction', cs.flexDirection); put('flex-wrap', cs.flexWrap)
      put('justify-content', cs.justifyContent); put('align-items', cs.alignItems); put('align-content', cs.alignContent)
      put('row-gap', cs.rowGap); put('column-gap', cs.columnGap)
    }
    if (display.includes('grid')) {
      put('grid-template-columns', authored(el, 'grid-template-columns'))
      put('grid-template-rows', authored(el, 'grid-template-rows'))
      put('justify-items', cs.justifyItems); put('align-items', cs.alignItems); put('align-content', cs.alignContent); put('justify-content', cs.justifyContent)
      put('row-gap', cs.rowGap); put('column-gap', cs.columnGap)
    }
    if (parentCs && (parentCs.display.includes('flex') || parentCs.display.includes('grid'))) {
      if (parentCs.display.includes('flex')) { put('flex-grow', cs.flexGrow); put('flex-shrink', cs.flexShrink); put('flex-basis', authored(el, 'flex-basis') ?? cs.flexBasis) }
      if (cs.alignSelf !== 'auto') put('align-self', cs.alignSelf)
      if (cs.justifySelf !== 'auto') put('justify-self', cs.justifySelf)
      if (cs.gridColumnStart !== 'auto' || cs.gridColumnEnd !== 'auto') put('grid-column', cs.gridColumnStart + ' / ' + cs.gridColumnEnd)
      if (cs.gridRowStart !== 'auto' || cs.gridRowEnd !== 'auto') put('grid-row', cs.gridRowStart + ' / ' + cs.gridRowEnd)
      if (cs.order !== '0') put('order', cs.order)
    }
    if (isSvg) {
      put('fill', cs.fill); put('stroke', cs.stroke); put('stroke-width', cs.strokeWidth)
      if (cs.strokeLinecap !== 'butt') put('stroke-linecap', cs.strokeLinecap)
      if (cs.strokeLinejoin !== 'miter') put('stroke-linejoin', cs.strokeLinejoin)
    }
    return out.join(';')
  }

  const KEEP = new Set(['href', 'aria-label', 'alt', 'src', 'title', 'colspan', 'rowspan', 'start', 'datetime'])
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which)
    if (!cs || cs.content === 'none' || cs.content === 'normal') return null
    const span = document.createElement('span')
    // 따옴표 글과 counter(이름)을 이어 붙인다. counter는 같은 태그 형제 사이 순서(시안의 번호 목록은 li마다 1씩 는다)
    const index = el.parentElement ? [...el.parentElement.children].filter((c) => c.localName === el.localName).indexOf(el) + 1 : 1
    let text = ''
    for (const t of cs.content.matchAll(/"((?:[^"\\]|\\.)*)"|counter\(\s*[\w-]+\s*\)/g)) text += t[1] !== undefined ? t[1].replace(/\\(.)/g, '$1') : String(index)
    if (text) span.textContent = text
    span.setAttribute('style', css(cs, el, getComputedStyle(el), false, which))
    return span
  }
  const build = (el, parentCs) => {
    if (el.nodeType === Node.TEXT_NODE) return document.createTextNode(el.nodeValue)
    if (el.nodeType !== Node.ELEMENT_NODE) return null
    if (el.hidden || ['script', 'style', 'template', 'defs', 'button', 'noscript'].includes(el.localName)) return null
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return null
    const isSvg = el.namespaceURI === SVG
    const copy = isSvg ? document.createElementNS(SVG, el.localName) : document.createElement(el.localName)
    for (const a of el.attributes) {
      if (isSvg ? !['class', 'id', 'style'].includes(a.name) : KEEP.has(a.name)) copy.setAttribute(a.name, a.value)
    }
    copy.setAttribute('style', css(cs, el, parentCs, isSvg))
    const before = isSvg ? null : pseudo(el, '::before')
    if (before) copy.appendChild(before)
    for (const ch of el.childNodes) { const c = build(ch, cs); if (c) copy.appendChild(c) }
    const after = isSvg ? null : pseudo(el, '::after')
    if (after) copy.appendChild(after)
    return copy
  }
  const bodyCs = getComputedStyle(document.body)
  const wrap = document.createElement('div')
  wrap.setAttribute('style', 'margin:0;padding:0;background-color:' + bodyCs.backgroundColor + ';color:' + bodyCs.color + ';font-family:' + bodyCs.fontFamily + ';font-size:' + bodyCs.fontSize + ';font-style:normal;line-height:' + bodyCs.lineHeight + ';word-break:keep-all')
  for (const ch of page.childNodes) { const c = build(ch, getComputedStyle(page)); if (c) wrap.appendChild(c) }
  return wrap.outerHTML
})()`

const srv = await serveStatic({ '/': PROMO })
const chrome = await launchChrome({ userDataDir: join(PROMO, '.cache-chrome-inline') })
let html
let poster = POSTER
try {
  await chrome.viewport(1100, 900, 1)
  await chrome.goto(`${srv.origin}/.inline-temp.html`)
  html = await chrome.eval(INLINE)
  // 영상 칸의 대표 이미지: 따로 주지 않으면 영상 대표 이미지를 960px JPEG로 줄여 글 안에 넣는다(올릴 파일이 하나 줄어든다)
  if (VIDEO && !poster) {
    poster = await chrome.eval(`(async () => {
      const img = new Image(); img.src = '/video/sure-mate-promo-poster.png'; await img.decode()
      const c = document.createElement('canvas'); c.width = 960; c.height = Math.round(960 * img.naturalHeight / img.naturalWidth)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/jpeg', 0.8)
    })()`)
  }
} finally {
  await chrome.close()
  srv.close()
  rmSync(temp, { force: true })
  rmSync(join(PROMO, '.cache-chrome-inline'), { recursive: true, force: true })
}

// 맨 위 영상 칸(--video). 대표 이미지는 재생 전까지 보인다(게시판이 data: 주소를 지우면 영상 첫 프레임이 보인다)
if (VIDEO) {
  const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const font = 'font-family:&quot;IBM Plex Sans KR&quot;, &quot;Malgun Gothic&quot;, &quot;Apple SD Gothic Neo&quot;, sans-serif'
  const band =
    `<section style="display:block;box-sizing:border-box;margin:0;padding:40px 0 36px 0;background-color:rgb(30, 33, 42)">` +
    `<div style="display:block;box-sizing:border-box;margin:0 auto;padding:0 32px;max-width:760px">` +
    `<video controls playsinline preload="metadata" src="${attr(VIDEO)}"${poster ? ` poster="${attr(poster)}"` : ''} style="display:block;box-sizing:border-box;width:100%;aspect-ratio:16 / 9;margin:0;padding:0;border-radius:12px;background-color:rgb(0, 0, 0)"></video>` +
    `<p style="display:block;box-sizing:border-box;margin:12px 0 0 0;padding:0;${font};font-size:13px;font-weight:400;font-style:normal;line-height:21px;color:rgb(169, 179, 193);text-align:center;word-break:keep-all">87초 소개 영상이에요. 소리를 꺼도 자막으로 다 읽혀요. 재생이 안 되면 첨부한 sure-mate-promo.mp4를 내려받아 보세요.</p>` +
    `</div></section>`
  html = html.replace(/^(<div[^>]*>)/, `$1${band}`)
}

writeFileSync(
  OUT,
  `<!-- 사내 게시판 붙여넣기용: 게시글 시안(docs/promo/sure-mate-promo.html) 첫째 탭을 줄 안 스타일로 바꾼 것. 시안을 고치면 node docs/promo/board/inline.mjs로 다시 만든다.
     편집기의 HTML(소스) 모드에 통째로 붙여넣고, 디자인 모드에서는 고치지 않는다. 글꼴(Jua·IBM Plex)은 아래 link가 지워지면 맑은 고딕으로 보인다. -->
<link rel="stylesheet" href="${FONTS}">
${html}
`
)
console.log(`${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`)
