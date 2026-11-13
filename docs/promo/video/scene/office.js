// 사무실 그림(영상용 평면 일러스트). 모니터와 같은 자리(1620×920)를 덮는다. 인물은 얼굴 없는 가상 인물이고,
// 화면 속 문서 이름은 가상 이름(XY방산)만 쓴다. buildOffice()가 그림을 만들고 drawOffice()가 프레임마다 움직인다.

const INK = '#17202A'
const SKIN = '#E8C2A0'
const SKIN_2 = '#DDB18E'
const SHIRT = '#4B7DB8'
const SHIRT_2 = '#3F6EA6'

const bars = (x, y, ws, step, fill = '#D9DEE3', h = 6) => ws.map((w, i) => `<rect x="${x}" y="${y + i * step}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`).join('')

/** 모니터 속 화면: 16:00 대외비 견적서 앞(secret), 15:19 서류 읽는 동안(idle) */
const SCREEN_SECRET = `
  <rect x="722" y="222" width="250" height="262" rx="5" fill="#fff"/>
  <rect x="722" y="222" width="250" height="18" rx="5" fill="#F3F4F6"/>
  ${bars(740, 258, [190, 150, 200, 170, 120, 190, 160, 140, 180, 100, 170], 18)}
  <rect x="1062" y="238" width="176" height="226" rx="5" fill="#fff"/>
  <rect x="1062" y="238" width="176" height="18" rx="5" fill="#F3F4F6"/>
  <circle cx="1082" cy="276" r="9" fill="#F3B7CF"/><circle cx="1082" cy="306" r="9" fill="#B8D4F5"/><circle cx="1082" cy="336" r="9" fill="#D3C6F2"/>
  ${bars(1098, 272, [90, 70, 100], 30)}
  <rect x="798" y="232" width="414" height="266" rx="6" fill="#E9ECF0" stroke="rgba(0,0,0,0.28)" stroke-width="1.5"/>
  <path d="M798 238 a6 6 0 0 1 6 -6 h402 a6 6 0 0 1 6 6 v18 h-414 Z" fill="#fff"/>
  <rect x="808" y="238" width="12" height="12" rx="3" fill="#2B5CC8"/>
  <text x="828" y="249" font-size="11" font-weight="500" fill="#3A4048">XY방산_견적서.docx — 문서 편집기</text>
  <rect x="824" y="264" width="362" height="234" fill="#fff"/>
  <text x="844" y="300" font-size="19" font-weight="800" fill="#8B1E1E">XY방산 시험장비 견적서</text>
  <g transform="translate(1128 290) rotate(-8)"><rect x="-42" y="-18" width="84" height="36" rx="6" fill="rgba(199,54,47,0.07)" stroke="#C7362F" stroke-width="3.5"/><text y="7" text-anchor="middle" font-size="18" font-weight="800" fill="#C7362F">대외비</text></g>
  <rect x="844" y="316" width="322" height="22" fill="#F4F5F7"/>
  <g font-size="11.5" fill="#5F6670" font-weight="600"><text x="852" y="331">품목</text><text x="996" y="331">수량</text><text x="1068" y="331">금액</text></g>
  <g font-size="11.5" fill="#1F2328"><text x="852" y="356">HIL 시험장비</text><text x="996" y="356">2식</text><text x="852" y="380">교정 서비스</text><text x="996" y="380">1년</text><text x="852" y="404">현장 설치</text><text x="996" y="404">1회</text></g>
  ${bars(1068, 348, [70, 58, 64], 24, '#C9CFD6', 9)}
  <path d="M844 338 H1166 M844 362 H1166 M844 386 H1166 M844 410 H1166" stroke="#E3E6EA" stroke-width="1.5"/>
  ${bars(844, 428, [300, 260, 290, 180], 16)}
  <rect x="706" y="500" width="548" height="16" fill="rgba(24,27,36,0.86)"/>`

const SCREEN_IDLE = `
  <rect x="722" y="222" width="330" height="262" rx="5" fill="#1F2229"/>
  <rect x="722" y="222" width="330" height="18" rx="5" fill="#1B1D23"/>
  ${[['#C792EA', 90], ['#82AAFF', 150], ['#6A7385', 200], ['#D4D7DD', 120], ['#FFCB6B', 170], ['#D4D7DD', 90], ['#C792EA', 140], ['#82AAFF', 110], ['#D4D7DD', 180], ['#6A7385', 150], ['#F78C6C', 70]].map(([c, w], i) => `<rect x="${750 + (i % 3) * 14}" y="${252 + i * 20}" width="${w}" height="7" rx="3" fill="${c}" opacity="0.85"/>`).join('')}
  <rect x="930" y="300" width="200" height="184" rx="5" fill="#fff"/>
  <rect x="930" y="300" width="200" height="18" rx="5" fill="#F4F7F5"/>
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M930 ${330 + i * 22} H1130" stroke="#E6E9EC" stroke-width="1.5"/>`).join('')}
  <path d="M970 318 V484 M1040 318 V484" stroke="#E6E9EC" stroke-width="1.5"/>
  <rect x="1140" y="214" width="104" height="282" rx="5" fill="#fff" stroke="rgba(0,0,0,0.25)"/>
  <rect x="1140" y="214" width="104" height="28" rx="5" fill="#1F8A57"/>
  <text x="1150" y="234" font-size="13" font-weight="800" fill="#fff">Ttree</text>
  ${bars(1152, 256, [80, 60, 74, 50, 70, 64, 56, 78], 26)}
  <rect x="1152" y="460" width="80" height="22" rx="6" fill="#D9EEE2"/>
  <path d="M1052 512 c-2 -14 6 -22 16 -22 s18 8 16 22 Z" fill="#3CC8B4" stroke="#17202A" stroke-width="2"/>
  <text x="1086" y="490" font-size="11" font-weight="800" fill="#A9B3C1">z</text>
  <rect x="706" y="500" width="548" height="16" fill="rgba(24,27,36,0.86)"/>`

/** 키보드(가까이 본 모습): 한 줄씩 [글자, 폭(키 칸), 한글, id] */
const KB_ROWS = [
  [['~', 1], ...'1234567890'.split('').map((k) => [k, 1]), ['-', 1], ['=', 1], ['←', 2]],
  [['Tab', 1.5], ...'QWERTYUIOP'.split('').map((k, i) => [k, 1, 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ'[i]]), ['[', 1], [']', 1], ['\\', 1.5]],
  [['Caps', 1.75], ...'ASDFGHJKL'.split('').map((k, i) => [k, 1, 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ'[i], k === 'H' ? 'h' : null]), [';', 1], ["'", 1], ['Enter', 2.25]],
  [['Shift', 2.25], ...'ZXCVBNM'.split('').map((k, i) => [k, 1, 'ㅋㅌㅊㅍㅠㅜㅡ'[i]]), [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]],
  [['Ctrl', 1.5, null, 'ctrl'], ['Win', 1.25], ['Alt', 1.5, null, 'alt'], ['한자', 1], ['', 5.5], ['한/영', 1.25], ['Fn', 1.5], ['Ctrl', 1.5]]
]
const P = 98
const KEY = 88
function keyboard() {
  let out = '<rect x="-766" y="-276" width="1532" height="552" rx="36" fill="#CBD4D8"/><rect x="-754" y="-264" width="1508" height="528" rx="30" fill="#DDE3E6"/>'
  const centers = {}
  KB_ROWS.forEach((row, r) => {
    let x = -730
    const y = -240 + r * P
    for (const [label, w, hangul, id] of row) {
      const kw = w * P - (P - KEY)
      const big = label.length === 1
      out += `<g class="kk"${id ? ` data-k="${id}"` : ''}><rect x="${x}" y="${y + 7}" width="${kw}" height="${KEY}" rx="14" fill="#AEB9BF"/>` +
        `<g class="cap"><rect class="glow" x="${x - 7}" y="${y - 7}" width="${kw + 14}" height="${KEY + 14}" rx="20" fill="none" stroke="#3CC8B4" stroke-width="10" opacity="0"/>` +
        `<rect class="face" x="${x}" y="${y}" width="${kw}" height="${KEY}" rx="14" fill="#fff"/>` +
        (label ? `<text x="${x + (big ? 20 : 16)}" y="${y + (big ? 42 : 38)}" font-size="${big ? 30 : id ? 28 : 20}" font-weight="${id ? 800 : 600}" fill="${INK}">${label.replace('&', '&amp;').replace('<', '&lt;')}</text>` : '') +
        (hangul ? `<text x="${x + kw - 20}" y="${y + KEY - 16}" text-anchor="end" font-size="20" font-weight="500" fill="#5F6670">${hangul}</text>` : '') +
        '</g></g>'
      if (id) centers[id] = { x: x + kw / 2, y: y + KEY / 2 }
      x += w * P
    }
  })
  return { svg: out, centers }
}

/** 둥근 끝 막대(손가락·팔): 테두리를 먼저 굵게 칠하고 위에 살색 */
const limb = (pts, w, fill, edge) => pts.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${edge}" stroke-width="${w + 7}" stroke-linecap="round"/>`).join('') +
  pts.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round"/>`).join('')

export function buildOffice(svg) {
  const kb = keyboard()
  // 손가락 끝: 키 아래쪽에 닿아 글자가 보이게(키보드 원점 810,470 기준 → 그림 좌표)
  const ctrl = { x: 810 + kb.centers.ctrl.x, y: 470 + kb.centers.ctrl.y }
  const alt = { x: 810 + kb.centers.alt.x, y: 470 + kb.centers.alt.y }
  const h = { x: 810 + kb.centers.h.x, y: 470 + kb.centers.h.y }
  svg.innerHTML = `
  <defs>
    <linearGradient id="of-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D7ECF3"/><stop offset="1" stop-color="#EEF7F7"/></linearGradient>
    <linearGradient id="of-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#182744"/><stop offset="0.5" stop-color="#22355E"/><stop offset="1" stop-color="#2C3E70"/></linearGradient>
    <radialGradient id="of-wash" cx="0.15" cy="0" r="0.9"><stop offset="0" stop-color="#3CC8B4" stop-opacity="0.16"/><stop offset="1" stop-color="#3CC8B4" stop-opacity="0"/></radialGradient>
    <clipPath id="of-scr"><rect x="706" y="202" width="548" height="314" rx="8"/></clipPath>
  </defs>
  <g id="of-wide">
    <rect width="1620" height="920" fill="#E4EFEC"/>
    <rect width="1620" height="620" fill="url(#of-wash)"/>
    <rect x="70" y="64" width="520" height="292" rx="12" fill="#F7FBFB"/>
    <rect x="84" y="78" width="492" height="264" rx="4" fill="url(#of-sky)"/>
    <path d="M110 342 V250 H170 V342 M190 342 V210 H260 V342 M420 342 V236 H480 V342 M500 342 V270 H560 V342" fill="#CFE3EA"/>
    <path d="M248 78 V342 M412 78 V342" stroke="#F7FBFB" stroke-width="10"/>
    <g transform="translate(1440 160)">
      <circle r="64" fill="#fff" stroke="${INK}" stroke-width="7"/>
      ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-50" x2="0" y2="${i % 3 ? -44 : -40}" stroke="${INK}" stroke-width="${i % 3 ? 3 : 5}" transform="rotate(${i * 30})"/>`).join('')}
      <line id="of-hour" x1="0" y1="6" x2="0" y2="-28" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <line id="of-min" x1="0" y1="8" x2="0" y2="-44" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <circle r="7" fill="#3CC8B4"/>
    </g>
    <rect x="230" y="384" width="1370" height="236" rx="14" fill="#CFE0DB"/>
    <rect x="230" y="374" width="1370" height="18" rx="9" fill="#B7CCC6"/>
    <rect x="0" y="618" width="1620" height="302" fill="#C9D7D3"/>
    <rect x="0" y="618" width="1620" height="8" fill="#BACAC5"/>
    <polygon points="330,562 1500,562 1560,642 270,642" fill="#F4EBDD"/>
    <rect x="270" y="642" width="1290" height="26" fill="#DCCDB6"/>
    <rect x="300" y="668" width="1230" height="140" fill="#B4C7C1"/>
    <path d="M394 562 L404 514 L452 514 L462 562 Z" fill="#fff" stroke="#C3D2CE" stroke-width="3"/>
    <ellipse cx="410" cy="478" rx="20" ry="44" fill="#3CC8B4" transform="rotate(-24 410 478)"/>
    <ellipse cx="450" cy="474" rx="20" ry="46" fill="#2FA595" transform="rotate(22 450 474)"/>
    <ellipse cx="430" cy="462" rx="18" ry="50" fill="#54D6C2"/>
    <rect x="1316" y="514" width="44" height="50" rx="8" fill="#fff" stroke="#C3D2CE" stroke-width="3"/>
    <rect x="1316" y="530" width="44" height="10" fill="#FFD447"/>
    <path d="M1360 526 c18 0 18 26 0 26" fill="none" stroke="#C3D2CE" stroke-width="6"/>
    <rect x="1392" y="540" width="100" height="24" rx="4" fill="#E9EEF0" stroke="#C3D2CE" stroke-width="2"/>
    <rect x="1400" y="530" width="84" height="12" rx="2" fill="#fff" stroke="#D5DCDA" stroke-width="2"/>
    <rect x="690" y="186" width="580" height="356" rx="20" fill="#1E212A"/>
    <rect x="706" y="202" width="548" height="314" rx="8" fill="url(#of-wall)"/>
    <g clip-path="url(#of-scr)"><g id="of-scr-secret">${SCREEN_SECRET}</g><g id="of-scr-idle">${SCREEN_IDLE}</g></g>
    <circle cx="980" cy="530" r="3.5" fill="#3CC8B4"/>
    <rect x="955" y="542" width="50" height="22" fill="#2A2F3B"/>
    <rect x="900" y="560" width="160" height="10" rx="5" fill="#2A2F3B"/>
    <polygon points="852,590 1152,590 1160,612 844,612" fill="#E9EEF0" stroke="#C3CCCA" stroke-width="2"/>
    <ellipse cx="1226" cy="604" rx="21" ry="13" fill="#fff" stroke="#B9C5C2" stroke-width="3"/>
    <g id="of-zzz" fill="#4E5C68" font-weight="800"><text x="1248" y="582" font-size="18">z</text><text x="1266" y="560" font-size="23">z</text><text x="1288" y="532" font-size="28">z</text></g>
    <g id="of-user">
      <g id="of-arms-type"><ellipse cx="784" cy="616" rx="32" ry="25" fill="${SHIRT_2}"/><ellipse cx="1016" cy="616" rx="32" ry="25" fill="${SHIRT_2}"/></g>
      <path d="M768 668 C768 600 790 554 846 546 L954 546 C1010 554 1032 600 1032 668 Z" fill="${SHIRT}"/>
      <g id="of-arms-read">
        <path d="M1000 590 C1046 572 1064 540 1070 508" stroke="${SHIRT}" stroke-width="42" stroke-linecap="round" fill="none"/>
        <g id="of-paper" transform="rotate(9 1084 446)">
          <rect x="1004" y="334" width="164" height="214" rx="4" fill="#fff" stroke="#D5DCDA" stroke-width="2"/>
          <rect x="1022" y="352" width="84" height="9" rx="3" fill="#A9B3C1"/>
          ${bars(1022, 376, [128, 110, 124, 96, 128, 116, 70, 120, 100], 18)}
        </g>
        <circle cx="1066" cy="512" r="18" fill="${SKIN}"/>
        <circle cx="1006" cy="468" r="15" fill="${SKIN}"/>
      </g>
      <rect x="880" y="506" width="40" height="46" rx="12" fill="${SKIN_2}"/>
      <ellipse cx="845" cy="488" rx="11" ry="16" fill="${SKIN_2}"/>
      <ellipse cx="955" cy="488" rx="11" ry="16" fill="${SKIN_2}"/>
      <circle cx="900" cy="470" r="57" fill="#2B2A33"/>
      <path d="M862 432 C882 418 920 416 940 430" stroke="#3A3946" stroke-width="5" fill="none" stroke-linecap="round"/>
    </g>
    <rect x="784" y="592" width="232" height="360" rx="52" fill="#2A2F3B"/>
    <rect x="806" y="614" width="188" height="300" rx="40" fill="#343A48"/>
    <g id="of-walker"><g id="of-bob">
      <g id="of-leg-b"><rect x="-21" y="-282" width="44" height="272" rx="21" fill="#2F3543"/><rect x="-24" y="-30" width="70" height="30" rx="14" fill="#1E212A"/></g>
      <g id="of-arm-b"><rect x="-30" y="-566" width="46" height="224" rx="23" fill="#8270C2"/><circle cx="-7" cy="-338" r="20" fill="#D9AE8A"/></g>
      <g id="of-leg-f"><rect x="-21" y="-282" width="44" height="272" rx="21" fill="#3B4252"/><rect x="-24" y="-30" width="70" height="30" rx="14" fill="#1E212A"/></g>
      <rect x="-74" y="-604" width="148" height="352" rx="52" fill="#9C8AD8"/>
      <path d="M-28 -602 L0 -552 L28 -602 Z" fill="#F3F8F7"/>
      <g id="of-whead">
        <rect x="-16" y="-632" width="32" height="42" rx="10" fill="#D9AE8A"/>
        <circle cx="-8" cy="-680" r="60" fill="#5A4036"/>
        <circle cx="10" cy="-666" r="54" fill="#E3B994"/>
        <path d="M-64 -690 C-56 -752 44 -760 66 -704 C30 -722 -8 -716 -30 -682 Z" fill="#5A4036"/>
        <circle cx="46" cy="-672" r="5" fill="${INK}"/>
      </g>
      <g id="of-arm-f">
        <rect x="-2" y="-570" width="46" height="172" rx="23" fill="#8A78C9"/>
        <rect x="2" y="-446" width="132" height="44" rx="22" fill="#8A78C9"/>
        <g transform="translate(150 -446)">
          <g id="of-steam" stroke="#AFC0BC" stroke-width="5" fill="none" stroke-linecap="round"><path d="M-9 -80 C-18 -94 0 -102 -9 -118"/><path d="M9 -82 C0 -96 18 -106 9 -122"/></g>
          <path d="M-23 -60 L23 -60 L18 0 L-18 0 Z" fill="#fff" stroke="#C3CCCA" stroke-width="3"/>
          <rect x="-21" y="-42" width="42" height="18" fill="#3CC8B4"/>
          <rect x="-27" y="-70" width="54" height="12" rx="5" fill="#E9EEF0" stroke="#C3CCCA" stroke-width="2"/>
        </g>
        <circle cx="136" cy="-430" r="21" fill="#E3B994"/>
      </g>
    </g></g>
    <g id="of-alert"><g id="of-alert-in">
      <path d="M-62 -26 L-84 -40 M62 -26 L84 -40 M0 -50 L0 -76" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <circle r="38" fill="#FFD447" stroke="${INK}" stroke-width="5"/>
      <text y="18" text-anchor="middle" font-size="54" font-weight="900" fill="${INK}">!</text>
    </g></g>
  </g>
  <g id="of-keys">
    <rect width="1620" height="920" fill="#EFE6D8"/>
    <path d="M0 120 H1620 M0 330 H1620 M0 820 H1620" stroke="#E6DBCB" stroke-width="3"/>
    <g id="of-kbcam">
      <g transform="translate(810 470)">${kb.svg}</g>
      <g id="of-hand-l">
        <line x1="300" y1="870" x2="350" y2="1010" stroke="${SHIRT}" stroke-width="150" stroke-linecap="round"/>
        ${limb([[262, 800, ctrl.x + 8, ctrl.y + 24], [272, 784, 262, 748], [300, 778, 300, 742], [328, 784, 340, 750], [340, 834, alt.x - 6, alt.y + 26]], 40, SKIN, '#C99A78')}
        <ellipse cx="296" cy="832" rx="78" ry="68" fill="#C99A78"/><ellipse cx="296" cy="832" rx="74" ry="64" fill="${SKIN}"/>
      </g>
      <g id="of-hand-r">
        <line x1="920" y1="720" x2="970" y2="1010" stroke="${SHIRT}" stroke-width="160" stroke-linecap="round"/>
        ${limb([[860, 640, h.x, h.y + 24], [904, 628, h.x + P + 2, h.y + 28], [946, 636, h.x + 2 * P - 6, h.y + 38], [982, 656, h.x + 3 * P - 22, h.y + 62], [846, 714, 772, 716]], 40, SKIN, '#C99A78')}
        <ellipse cx="912" cy="690" rx="88" ry="74" fill="#C99A78"/><ellipse cx="912" cy="690" rx="84" ry="70" fill="${SKIN}"/>
      </g>
    </g>
  </g>`
  const $ = (s) => svg.querySelector(s)
  return {
    wide: $('#of-wide'),
    keys: $('#of-keys'),
    kbcam: $('#of-kbcam'),
    secret: $('#of-scr-secret'),
    idle: $('#of-scr-idle'),
    typeArms: $('#of-arms-type'),
    readArms: $('#of-arms-read'),
    paper: $('#of-paper'),
    zzz: $('#of-zzz'),
    user: $('#of-user'),
    alert: $('#of-alert'),
    walker: $('#of-walker'),
    bob: $('#of-bob'),
    legF: $('#of-leg-f'),
    legB: $('#of-leg-b'),
    armB: $('#of-arm-b'),
    steam: $('#of-steam'),
    hour: $('#of-hour'),
    min: $('#of-min'),
    handL: $('#of-hand-l'),
    handR: $('#of-hand-r'),
    caps: Object.fromEntries([...svg.querySelectorAll('[data-k]')].map((g) => [g.dataset.k, g.querySelector('.cap')]))
  }
}

const set = (el, attr, v) => {
  if (el.__a?.[attr] === v) return
  ;(el.__a ??= {})[attr] = v
  el.setAttribute(attr, v)
}

/**
 * 한 프레임: o = { shot: 'wide'|'keys', screen: 'secret'|'idle', reading, zoom: [s, x, y], walker: { x, phase } | null,
 * alert: 0..1(튀어나옴), jolt, clock: [시, 분], down: { ctrl, alt, h }, kbZoom, t }
 */
export function drawOffice(h, o) {
  const wide = o.shot === 'wide'
  set(h.wide, 'display', wide ? 'inline' : 'none')
  set(h.keys, 'display', wide ? 'none' : 'inline')
  if (wide) {
    const [s, x, y] = o.zoom ?? [1, 810, 460]
    // (x, y)를 그 자리에 둔 채 s배로 다가간다
    set(h.wide, 'transform', `translate(${x * (1 - s)} ${y * (1 - s)}) scale(${s})`)
    set(h.secret, 'display', o.screen === 'secret' ? 'inline' : 'none')
    set(h.idle, 'display', o.screen === 'idle' ? 'inline' : 'none')
    set(h.typeArms, 'display', o.reading ? 'none' : 'inline')
    set(h.readArms, 'display', o.reading ? 'inline' : 'none')
    set(h.zzz, 'display', o.reading ? 'inline' : 'none')
    if (o.reading) {
      set(h.paper, 'transform', `rotate(${9 + Math.sin(o.t * 1.3) * 1.5} 1084 446)`)
      set(h.zzz, 'transform', `translate(0 ${-4 * Math.sin(o.t * 2)})`)
    }
    set(h.user, 'transform', `translate(0 ${o.jolt ?? 0})`)
    const [hh, mm] = o.clock ?? [16, 0]
    set(h.hour, 'transform', `rotate(${((hh % 12) + mm / 60) * 30})`)
    set(h.min, 'transform', `rotate(${mm * 6})`)
    const a = o.alert ?? 0
    set(h.alert, 'display', a > 0 ? 'inline' : 'none')
    // 머리 왼쪽 위(모니터 속 문서 제목과 대외비 도장을 가리지 않는 자리)
    if (a > 0) set(h.alert, 'transform', `translate(800 ${394 + (o.jolt ?? 0)}) scale(${0.9 * a}) rotate(${(1 - Math.min(1, a)) * -18})`)
    if (o.walker) {
      const { x, phase } = o.walker
      const sw = Math.sin(phase)
      set(h.walker, 'display', 'inline')
      set(h.walker, 'transform', `translate(${x} 906)`)
      set(h.bob, 'transform', `translate(0 ${-7 * Math.abs(Math.cos(phase))})`)
      set(h.legF, 'transform', `rotate(${-22 * sw} 0 -270)`)
      set(h.legB, 'transform', `rotate(${22 * sw} 0 -270)`)
      set(h.armB, 'transform', `rotate(${-16 * sw} -7 -556)`)
      set(h.steam, 'transform', `translate(${2 * Math.sin(o.t * 5)} 0)`)
    } else set(h.walker, 'display', 'none')
  } else {
    const s = o.kbZoom ?? 1
    set(h.kbcam, 'transform', `translate(${560 * (1 - s)} ${560 * (1 - s)}) scale(${s})`)
    for (const [k, cap] of Object.entries(h.caps)) {
      const d = Boolean(o.down?.[k])
      set(cap, 'transform', d ? 'translate(0 6)' : 'translate(0 0)')
      set(cap.querySelector('.glow'), 'opacity', d ? '0.55' : '0')
      set(cap.querySelector('.face'), 'fill', d ? '#DDF6F1' : '#fff')
    }
    set(h.handL, 'transform', o.down?.ctrl || o.down?.alt ? 'translate(0 6)' : 'translate(0 0)')
    set(h.handR, 'transform', o.down?.h ? 'translate(0 6)' : 'translate(0 0)')
  }
}
