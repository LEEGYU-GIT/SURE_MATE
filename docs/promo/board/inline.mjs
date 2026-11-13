// 게시글 시안(sure-mate-promo.html) 첫째 탭을 사내 게시판에 그대로 붙여넣을 수 있는 HTML(board/post-design.html)로 바꾼다.
// 게시판 편집기는 <style>·<script>·클래스를 지우는 경우가 많아서, 브라우저가 계산한 모양을 요소마다 style=""로 옮겨 적는다.
//   - 폭·높이·가운데 맞춤(margin auto)·그리드 칸처럼 글쓴 값이 중요한 속성은 시안 CSS에 적힌 값을 쓰고, 나머지는 계산한 값을 쓴다
//   - ::before/::after(Q./A. 머리, 말풍선 꼬리 등)는 진짜 <span>으로 바꾸고, 말랑 메이트 SVG의 <use>는 그림을 펼쳐 넣는다
//   - 데모 단추처럼 게시판용 이미지에서 숨기는 것(.export 규칙)은 넣지 않는다
// 실행: 저장소 루트에서 node docs/promo/board/inline.mjs (설치된 Chrome·Edge, 인터넷(Google Fonts) 필요)
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROMO = join(HERE, '..')
const { launchChrome, serveStatic } = await import(pathToFileURL(join(PROMO, 'video/lib/cdp.mjs')).href)
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Jua&display=swap'

const temp = join(PROMO, '.inline-temp.html')
const body = readFileSync(join(PROMO, 'sure-mate-promo.html'), 'utf8')
writeFileSync(temp, `<!doctype html><html lang="ko" class="export" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=1100"><style>html,body{margin:0}</style></head><body>${body}</body></html>`)

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

  // 2. 글쓴 값을 찾을 규칙(지금 화면에 맞는 미디어 쿼리 안의 규칙까지, 나온 순서대로 뒤의 것이 이긴다)
  const rules = []
  const collect = (list) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) rules.push(r)
      else if (r instanceof CSSMediaRule) { if (matchMedia(r.media.mediaText).matches) collect(r.cssRules) }
      else if (r.cssRules) collect(r.cssRules)
    }
  }
  for (const sh of document.styleSheets) { try { collect(sh.cssRules) } catch {} }
  const AUTHORED = ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin-left', 'margin-right', 'grid-template-columns', 'flex-basis', 'left', 'top', 'right', 'bottom', 'aspect-ratio']
  // var(--이름)은 그 요소의 계산한 사용자 속성 값으로, env(…, 기본값)은 기본값으로 바꾼다(게시판에는 시안의 :root 변수가 없다)
  const resolve = (el, v) => {
    let out = v
    for (let i = 0; i < 5 && /var\(|env\(/.test(out); i++) {
      out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fb) => getComputedStyle(el).getPropertyValue(name).trim() || (fb ?? '').trim())
      out = out.replace(/env\(\s*[\w-]+\s*(?:,\s*([^()]*))?\)/g, (_, fb) => (fb ?? '0px').trim())
    }
    return /var\(|env\(/.test(out) ? null : out
  }
  const authoredOf = (el, prop) => {
    const own = el.style ? el.style.getPropertyValue(prop) : ''
    if (own) return resolve(el, own)
    let found = null
    for (const r of rules) {
      const v = r.style.getPropertyValue(prop)
      if (!v) continue
      let ok = false
      try { ok = el.matches(r.selectorText) } catch { ok = false }
      if (ok) found = v
    }
    return found ? resolve(el, found) : null
  }

  const px0 = (v) => v === '0px' || v === '0' || v === 'auto' && false
  const css = (cs, el, parentCs, isSvg, isPseudo = false) => {
    const authored = isPseudo ? (() => null) : authoredOf
    const out = []
    const put = (k, v) => { if (v !== null && v !== undefined && v !== '') out.push(k + ':' + v) }
    const display = cs.display
    put('display', display)
    put('box-sizing', cs.boxSizing)
    // 글자: 게시판 CSS가 글자 모양을 덮지 못하게 늘 적는다
    put('font-family', cs.fontFamily)
    put('font-size', cs.fontSize)
    put('font-weight', cs.fontWeight)
    if (cs.fontStyle !== 'normal') put('font-style', cs.fontStyle)
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
    const ml = authored(el, 'margin-left'), mr = authored(el, 'margin-right')
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
    if (cs.transform !== 'none') put('transform', cs.transform)
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') put('overflow', cs.overflowX + ' ' + cs.overflowY)
    if (cs.position !== 'static') {
      put('position', cs.position)
      for (const k of ['top', 'right', 'bottom', 'left']) { const a = authored(el, k); put(k, a ?? cs[k]) }
      if (cs.zIndex !== 'auto') put('z-index', cs.zIndex)
    }
    if (display.includes('list-item') || el.localName === 'ul' || el.localName === 'ol') put('list-style', cs.listStyleType + ' ' + cs.listStylePosition)
    // 크기: 시안 CSS에 적힌 값만(글자 폭이 달라져도 줄이 다시 맞게). 의사 요소(말풍선 꼬리·창 색 띠)는 계산한 크기를 쓴다
    if (isPseudo) {
      if (cs.position !== 'static' || !display.startsWith('inline') || display === 'inline-block') { put('width', cs.width); put('height', cs.height) }
    } else {
      for (const k of ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio']) {
        const a = authored(el, k)
        if (a && a !== 'auto' && a !== 'none') put(k, a)
      }
    }
    // 펼침·격자 상자
    if (display.includes('flex')) {
      put('flex-direction', cs.flexDirection); put('flex-wrap', cs.flexWrap)
      put('justify-content', cs.justifyContent); put('align-items', cs.alignItems); put('align-content', cs.alignContent)
      put('row-gap', cs.rowGap); put('column-gap', cs.columnGap)
    }
    if (display.includes('grid')) {
      put('grid-template-columns', authored(el, 'grid-template-columns') ?? cs.gridTemplateColumns)
      if (cs.gridTemplateRows !== 'none') put('grid-template-rows', cs.gridTemplateRows)
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
  const pseudo = (el, which, parentCs) => {
    const cs = getComputedStyle(el, which)
    if (!cs || cs.content === 'none' || cs.content === 'normal') return null
    const span = document.createElement('span')
    // 따옴표 글과 counter(이름)을 이어 붙인다. counter는 같은 태그 형제 사이 순서(시안의 번호 목록은 li마다 1씩 는다)
    const index = el.parentElement ? [...el.parentElement.children].filter((c) => c.localName === el.localName).indexOf(el) + 1 : 1
    let text = ''
    for (const t of cs.content.matchAll(/"((?:[^"\\]|\\.)*)"|counter\(\s*[\w-]+\s*\)/g)) text += t[1] !== undefined ? t[1].replace(/\\(.)/g, '$1') : String(index)
    if (text) span.textContent = text
    span.setAttribute('style', css(cs, el, getComputedStyle(el), false, true))
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
    const before = isSvg ? null : pseudo(el, '::before', parentCs)
    if (before) copy.appendChild(before)
    for (const ch of el.childNodes) { const c = build(ch, cs); if (c) copy.appendChild(c) }
    const after = isSvg ? null : pseudo(el, '::after', parentCs)
    if (after) copy.appendChild(after)
    return copy
  }
  const bodyCs = getComputedStyle(document.body)
  const wrap = document.createElement('div')
  wrap.setAttribute('style', 'margin:0;padding:0;background-color:' + bodyCs.backgroundColor + ';color:' + bodyCs.color + ';font-family:' + bodyCs.fontFamily + ';font-size:' + bodyCs.fontSize + ';line-height:' + bodyCs.lineHeight + ';word-break:keep-all')
  for (const ch of page.childNodes) { const c = build(ch, getComputedStyle(page)); if (c) wrap.appendChild(c) }
  return wrap.outerHTML
})()`

const srv = await serveStatic({ '/': PROMO })
const chrome = await launchChrome({ userDataDir: join(PROMO, '.cache-chrome-inline') })
let html
try {
  await chrome.viewport(1100, 900, 1)
  await chrome.goto(`${srv.origin}/.inline-temp.html`)
  html = await chrome.eval(INLINE)
} finally {
  await chrome.close()
  srv.close()
  rmSync(temp, { force: true })
  rmSync(join(PROMO, '.cache-chrome-inline'), { recursive: true, force: true })
}
const out = join(HERE, 'post-design.html')
writeFileSync(
  out,
  `<!-- 사내 게시판 붙여넣기용: 게시글 시안(docs/promo/sure-mate-promo.html) 첫째 탭을 줄 안 스타일로 바꾼 것. 시안을 고치면 node docs/promo/board/inline.mjs로 다시 만든다.
     편집기의 HTML(소스) 모드에 통째로 붙여넣는다. 글꼴(Jua·IBM Plex Sans KR)은 아래 link가 지워지면 맑은 고딕으로 보인다. -->
<link rel="stylesheet" href="${FONTS}">
${html}
`
)
console.log(`${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`)
