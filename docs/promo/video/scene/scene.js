// Sure-Mate 홍보 영상: 시간 t(초)를 받으면 그 순간의 화면을 그리는 결정적 타임라인.
// 렌더러(render.mjs)는 프레임마다 window.__render(t)를 부르고 찍는다. ?t=12.5 는 한 장면 확인, ?play 는 실시간 재생.
// Sure-Mate 화면(팔레트·확인 화면·바·용어 카드·말랑 메이트·말풍선)은 capture.mjs가 실제 앱 코드로 그린 캡처이고,
// 여기서 그리는 것은 바탕화면과 다른 앱 창(가상 이름만), 자막, 키, 커서, 카메라다.

const CACHE = '../.cache/'
const fx = await (await fetch(CACHE + 'fixtures.json')).json()
const ui = await (await fetch(CACHE + 'ui/manifest.json')).json()
const LAY = ui.layout

// ── 시간 도구 ──────────────────────────────────────────────
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const seg = (t, a, b) => clamp01((t - a) / (b - a))
const lerp = (a, b, p) => a + (b - a) * p
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (u) => ((ax * u + bx) * u + cx) * u
  const sy = (u) => ((ay * u + by) * u + cy) * u
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let u = x
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x
      const d = dx(u)
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break
      u -= e / d
    }
    return sy(clamp01(u))
  }
}
/** 앱의 들어오고 나가는 곡선(tokens.css --ease-out) */
const appOut = bezier(0.23, 1, 0.32, 1)
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const outCubic = (p) => 1 - Math.pow(1 - p, 3)
const outBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2)
/** keyframes [[t, value], …] 사이를 ease로 잇는다(value는 숫자 또는 숫자 배열) */
function track(t, frames, ease = inOut) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    if (t <= t1) {
      const [t0, v0] = frames[i - 1]
      const p = ease(seg(t, t0, t1))
      return Array.isArray(v0) ? v0.map((v, k) => lerp(v, v1[k], p)) : lerp(v0, v1, p)
    }
  }
  return frames[frames.length - 1][1]
}
/** 위로 솟았다 내려앉는 폴짝(높이 h, 길이 d초) */
const hopY = (t, t0, h = 16, d = 0.42) => (t < t0 || t > t0 + d ? 0 : -h * 4 * seg(t, t0, t0 + d) * (1 - seg(t, t0, t0 + d)))

// ── DOM 도구 ──────────────────────────────────────────────
const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const memo = new WeakMap()
function css(el, prop, val) {
  let m = memo.get(el)
  if (!m) memo.set(el, (m = {}))
  if (m[prop] === val) return
  m[prop] = val
  el.style[prop] = val
}
function cls(el, name, on) {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on)
}
function text(el, value) {
  if (el.__text !== value) {
    el.__text = value
    el.textContent = value
  }
}
function html(el, value) {
  if (el.__html !== value) {
    el.__html = value
    el.innerHTML = value
  }
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const img = (file) => {
  const i = new Image()
  i.src = CACHE + 'ui/' + file
  i.alt = ''
  return i
}

// ── 오디오 신호(audio.py가 이 시각에 효과음을 넣는다) ───────────────────
const CUES = []
const cue = (t, type, gain = 1) => CUES.push({ t: Math.round(t * 1000) / 1000, type, gain })

// ── 장면 시각 ─────────────────────────────────────────────
const T = { s1: 3.0, s2: 11.0, s3: 18.0, s4: 35.0, s5: 44.0, s6: 51.0, s7: 58.0, s8: 66.5, outro: 71.5, end: 77.0 }
const CUTS = [T.s2, T.s3, T.s4, T.s5, T.s6, T.s7, T.s8]
const DURATION = T.end

// ── 자막·시각·키 ───────────────────────────────────────────
const CAPTIONS = [
  [T.s1, '09:00', '출근하면, 근무 시작부터'],
  [T.s1 + 3.4, '09:00', '‘출근’만 쳐도 Ttree가 열려요'],
  [T.s2, '09:05', '어제 띄워 둔 창이 뒤죽박죽'],
  [T.s2 + 2.6, '09:05', '저장해 둔 배치로, 단축키 한 번'],
  [T.s3, '10:30', '회의가 끝나면, 회의록 정리'],
  [T.s3 + 5.0, '10:30', '보내기 전에 고객사·사람 이름·IP는 가명으로'],
  [T.s3 + 11.6, '10:30', 'AI는 <span class="tok">CLIENT_A</span>만 알아요'],
  [T.s4, '10:40', 'AI가 쓴 회의록을 보고서로 옮길 때'],
  [T.s4 + 3.9, '10:40', '‘가명 되돌려줘’ 하면 원래 이름으로'],
  [T.s5, '13:00', '요구사항을 읽다가, ‘MC/DC’가 뭐였더라?'],
  [T.s5 + 2.4, '13:00', '용어 뜻은 바 옆에, 쓰던 창은 그대로'],
  [T.s6, '14:30', '결함을 찾았다면, 리포트 양식부터'],
  [T.s6 + 3.0, '14:30', '자주 쓰는 양식은 느낌표 하나로'],
  [T.s7, '16:00', '자리로 손님이 온다면'],
  [T.s7 + 2.2, '16:00', '업무 창만 남기고 모두 내려요'],
  [T.s7 + 5.3, '16:00', '한 번 더 누르면 그대로'],
  [T.s8, '17:10', '한 시간 넘게 집중했다면'],
  [T.s8 + 1.9, '17:10', '말랑 메이트가 쉬어 가자고 말을 걸어요']
]

const KEYS = []
/** 키 조합 누름: 보조키부터 0.08초 간격으로 누르고 0.22초 뒤 뗀다 */
function press(t, keys) {
  KEYS.push({ t, keys })
  keys.forEach((_, i) => cue(t - (keys.length - 1 - i) * 0.08, 'key', i === keys.length - 1 ? 1 : 0.7))
}

// ── 다른 앱 창(가상 내용) ───────────────────────────────────────
const CODE = [
  '<span class="cm">/* 브레이크 페달 신호 이중화 판정 (REQ-BRK-012) */</span>',
  '<span class="kw">#include</span> <span class="st">"brake_ctrl.h"</span>',
  '<span class="kw">#include</span> <span class="st">"can_rx.h"</span>',
  '',
  '<span class="kw">#define</span> PEDAL_DIFF_LIMIT_MS  (<span class="nu">50u</span>)',
  '<span class="kw">#define</span> PEDAL_TOLERANCE      (<span class="nu">120u</span>)',
  '',
  '<span class="kw">static</span> <span class="ty">uint16_t</span> s_mismatch_ms = <span class="nu">0u</span>;',
  '',
  '<span class="ty">BrakeStatus</span> <span class="fn">Brake_CheckPedal</span>(<span class="kw">const</span> <span class="ty">PedalInput</span> *in)',
  '{',
  '    <span class="ty">BrakeStatus</span> st = BRAKE_OK;',
  '    <span class="ty">uint16_t</span> diff = (in-&gt;ch1 &gt; in-&gt;ch2)',
  '                  ? (in-&gt;ch1 - in-&gt;ch2)',
  '                  : (in-&gt;ch2 - in-&gt;ch1);',
  '',
  '    <span class="kw">if</span> ((in-&gt;valid1 == <span class="nu">0u</span>) || (in-&gt;valid2 == <span class="nu">0u</span>)) {',
  '        st = BRAKE_SENSOR_FAULT;',
  '    } <span class="kw">else if</span> (diff &gt; PEDAL_TOLERANCE) {',
  '        s_mismatch_ms += CYCLE_MS;',
  '        <span class="kw">if</span> (s_mismatch_ms &gt;= PEDAL_DIFF_LIMIT_MS) {',
  '            st = BRAKE_PEDAL_MISMATCH;',
  '        }',
  '    } <span class="kw">else</span> {',
  '        s_mismatch_ms = <span class="nu">0u</span>;',
  '    }',
  '    <span class="kw">return</span> st;',
  '}',
  '',
  '<span class="cm">/* 정적분석 규칙 10.4: 부호 없는 정수끼리만 비교 */</span>',
  '<span class="ty">bool</span> <span class="fn">Brake_IsReleased</span>(<span class="ty">uint16_t</span> raw)',
  '{',
  '    <span class="kw">return</span> (raw &lt; PEDAL_RELEASE_RAW);',
  '}'
]
const SHEET_ROWS = [
  ['TC-BRK-001', 'REQ-BRK-010', '페달 신호 정상 범위', '통과'],
  ['TC-BRK-002', 'REQ-BRK-011', '채널 1 단선 감지', '통과'],
  ['TC-BRK-003', 'REQ-BRK-012', '두 채널 불일치 50ms', '실패'],
  ['TC-BRK-004', 'REQ-BRK-012', '불일치 49ms 유지', '통과'],
  ['TC-BRK-005', 'REQ-BRK-013', '페달 해제 판정', '통과'],
  ['TC-BRK-006', 'REQ-BRK-014', 'CAN 수신 끊김', '통과'],
  ['TC-BRK-007', 'REQ-BRK-015', '전원 재시작 후 복귀', '통과'],
  ['TC-BRK-008', 'REQ-BRK-016', '경고등 점등 시간', '보류'],
  ['TC-BRK-009', 'REQ-BRK-017', '고장 코드 저장', '통과'],
  ['TC-BRK-010', 'REQ-BRK-018', '진단 응답 시간', '통과'],
  ['TC-BRK-011', 'REQ-BRK-019', '저전압 동작', '통과'],
  ['TC-BRK-012', 'REQ-BRK-020', '고전압 보호', '통과'],
  ['TC-BRK-013', 'REQ-BRK-021', 'MC/DC 보강 시험', '진행'],
  ['TC-BRK-014', 'REQ-BRK-022', 'HIL 회귀 시험', '보류']
]
const resultCls = (r) => (r === '통과' ? 'ok' : r === '실패' ? 'ng' : '')

/** 간단한 마크다운(### 제목, - 목록, 1. 목록, 표, 문단)을 블록 HTML 배열로. wrap: 감쌀 낱말과 class */
function markdown(src, wrap) {
  const words = [...wrap.words].sort((a, b) => b.length - a.length)
  const re = words.length ? new RegExp(words.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null
  const inline = (s) => {
    const e = esc(s)
    return re ? e.replace(re, (m) => `<span class="${wrap.cls}">${m}</span>`) : e
  }
  const lines = src.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; ) {
    const l = lines[i]
    if (l.startsWith('### ')) {
      blocks.push(`<h4>${inline(l.slice(4))}</h4>`)
      i++
    } else if (l.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim())
      const head = cells(rows[0])
      const body = rows.slice(2).map(cells)
      blocks.push(`<table><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`)
    } else if (/^- /.test(l)) {
      const items = []
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2))
      blocks.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`)
    } else if (/^\d+\. /.test(l)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''))
      blocks.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`)
    } else if (!l.trim()) {
      i++
    } else {
      blocks.push(`<p>${inline(l)}</p>`)
      i++
    }
  }
  return blocks
}

const TOKENS = fx.maskedItems.map((m) => m.replacement)
const ORIGINALS = fx.maskedItems.map((m) => m.original)
const answerBlocks = markdown(fx.aiAnswer, { words: TOKENS, cls: 'tok' })
const restoredBlocks = markdown(fx.restoredAnswer, { words: ORIGINALS, cls: 'rest' })
const promptHead = fx.prompt.split('\n').slice(0, 6).join('\n')
const promptLines = (n) => fx.prompt.split('\n').slice(0, n).join('\n')
const tokWrap = (s) => {
  const re = new RegExp(TOKENS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  return esc(s).replace(re, (m) => `<span class="tok">${m}</span>`)
}
const memoLines = fx.memo.split('\n')
const browser = (url, page) => `<div class="browser"><div class="bar"><div class="nav"><span>←</span><span>→</span><span>⟳</span></div><div class="url">${url}</div></div><div class="page">${page}</div></div>`
const TITLE_CTL = '<span class="ctl"><span>—</span><span>☐</span><span>✕</span></span>'

/** 창 정의: app은 작업 표시줄 칸, ico는 제목 줄 아이콘 */
const WINDOWS = {
  ttree: { app: 'ttree', ico: ['#1F8A57', 'T'], title: 'Ttree', body: `
    <div class="ttree">
      <div class="top"><b>Ttree</b><span>2026.11.16 (월)</span></div>
      <div class="me"><i></i><div>김가상 책임<br><small style="color:#6B737D;font-weight:500">시험검증2팀</small></div></div>
      <div class="state"><small>오늘 근무</small><strong>근무 전</strong><small class="since">아직 출근 기록이 없어요</small></div>
      <div class="go">근무 시작</div>
      <div class="row3"><span>이석</span><span>휴가 신청</span><span>컴퓨터 종료</span></div>
      <div class="week">이번 주 근무 <b class="wk">0시간 0분</b> / 40시간</div>
      <div class="meter"><i></i></div>
    </div>` },
  code: { app: 'code', dark: true, ico: ['#3B7BEA', '&lt;/&gt;'], title: 'brake_ctrl.c — BCM — 코드 편집기', body: `
    <div class="code"><div class="act"><i></i><i></i><i></i><i></i></div>
      <div class="tree"><div class="dir">BCM</div><div class="sub dir">src</div><div class="sub on">brake_ctrl.c</div><div class="sub">brake_ctrl.h</div><div class="sub">can_rx.c</div><div class="sub">diag.c</div><div class="sub dir">test</div><div class="sub">test_brake.c</div><div class="sub">test_can.c</div></div>
      <div class="ed"><div class="tabs"><span class="on">brake_ctrl.c</span><span>can_rx.c</span><span>test_brake.c</span></div><pre>${CODE.map((l) => `<span class="l">${l || ' '}</span>`).join('')}</pre></div>
    </div>` },
  sheet: { app: 'sheet', ico: ['#1E8E4F', '표'], title: '시험결과_BCM.xlsx — 표 편집기', body: `
    <div class="sheet"><div class="ribbon"><span>파일</span><span class="on">홈</span><span>삽입</span><span>수식</span><span>데이터</span><span>검토</span></div>
      <div class="fx"><b>E4</b><span>실패</span></div>
      <table><colgroup><col style="width:34px"><col style="width:102px"><col style="width:104px"><col><col style="width:60px"></colgroup>
        <tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
        <tr><th>1</th><td class="h">시험 ID</td><td class="h">요구사항</td><td class="h">시험 항목</td><td class="h">결과</td></tr>
        ${SHEET_ROWS.map((r, i) => `<tr><th>${i + 2}</th><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="${resultCls(r[3])}">${r[3]}</td></tr>`).join('')}
      </table></div>` },
  wiki: { app: 'browser', ico: ['#2F6FE4', 'W'], title: 'BCM 시험 일정 — 사내 위키 — 브라우저', body: browser('wiki.example.com/BCM/시험-일정', `
    <div style="padding:22px 28px;font:400 13.5px/1.7 var(--ui)"><h3 style="margin:0 0 12px;font:700 19px/1.3 var(--ui)">BCM 시험 일정</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${[['11/17', '정적분석 위반 소명 마감'], ['11/18', 'HIL 2번 장비 수리'], ['11/20', 'MC/DC 보강 시험'], ['11/21', '회귀 시험·결과 보고']].map(([d, w]) => `<tr><td style="border-bottom:1px solid #E3E6EA;padding:8px 6px;width:70px;color:#5F6670">${d}</td><td style="border-bottom:1px solid #E3E6EA;padding:8px 6px">${w}</td></tr>`).join('')}</table></div>`) },
  msg: { app: 'msg', ico: ['#D9538E', '메'], title: '사내 메신저', body: `
    <div class="msg"><div class="list">
        <div class="on"><i style="background:#F3B7CF"></i><span>이예시<small>XY방산 문서 검토도…</small></span></div>
        <div><i style="background:#B8D4F5"></i><span>시험검증2팀<small>오후 회의 3시로 변경</small></span></div>
        <div><i style="background:#D3C6F2"></i><span>박예시 팀장<small>주간보고 내일 오전까지</small></span></div>
        <div><i style="background:#C9E8D6"></i><span>XY방산 납품 TF<small>문서 2건 올렸습니다</small></span></div>
      </div>
      <div class="room"><div class="who">이예시</div>
        <div class="b">회의록 오늘 중으로 공유 부탁드려요.</div>
        <div class="b">HIL 2번은 수리 요청 넣어 두었어요.</div>
        <div class="b me">네, 정리해서 올릴게요.</div>
        <div class="b">XY방산 납품 문서 검토도 오늘 가능할까요?</div>
        <div class="t">오후 3:52</div>
      </div></div>` },
  memo: { app: 'memo', ico: ['#5B6577', '메모'], title: '회의 메모.txt — 메모장', body: `
    <div class="memo"><div class="menu"><span>파일</span><span>편집</span><span>보기</span></div>
      <div class="text">${memoLines.map((l) => `<span class="ln"><span class="selbox"></span>${esc(l)}</span>`).join('')}</div></div>` },
  ai: { app: 'browser', ico: ['#2F6FE4', 'AI'], title: `${fx.aiTarget.name} — 브라우저`, body: browser(fx.aiTarget.url.replace(/^https:\/\//, ''), `
    <div class="chat"><div class="side"><div class="new">＋ 새 대화</div><div class="item on">새 대화</div><div class="item">시험 항목 정리</div><div class="item">주간보고 다듬기</div><div class="item">MISRA 규칙 질문</div></div>
      <div class="main"><div class="thread"><div class="hello">무엇을 도와드릴까요?</div>
          <div class="user" style="display:none"><span class="more">더 보기</span>${tokWrap(promptHead)}</div>
          <div class="bot" style="display:none"><div class="av"></div><div class="answer md">${answerBlocks.map((b) => `<div class="blk">${b}</div>`).join('')}<span class="selbox" style="top:0;bottom:auto;left:-4px;right:-4px;width:auto"></span></div></div>
        </div>
        <div class="composer empty"><span class="ph">메시지를 입력하세요</span><span class="send"></span></div>
      </div></div>`) },
  doc: { app: 'doc', ico: ['#2B5CC8', '문서'], title: '회의록_BCM_1116.docx — 문서 편집기', body: `
    <div class="doc"><div class="ribbon"><span>파일</span><span class="on">홈</span><span>삽입</span><span>레이아웃</span><span>검토</span></div>
      <div class="sheetwrap"><div class="page"><h3>BCM 주간 회의록</h3><div class="meta">작성 김가상 · 2026.11.16</div>
        <div class="pasted md" style="display:none">${restoredBlocks.join('')}</div><span class="caret"></span></div></div></div>` },
  pdf: { app: 'pdf', ico: ['#C7362F', 'PDF'], title: '가상자동차_BCM_요구사항_v1.2.pdf — PDF 보기', body: `
    <div class="pdf"><div class="tools"><span>12 / 48</span><span>－</span><span>100%</span><span>＋</span><span style="margin-left:auto">검색</span></div>
      <div class="pagewrap"><div class="page"><div class="hdr"><span>가상자동차 BCM 소프트웨어 요구사항 명세 v1.2</span><span>12</span></div>
        <h3>4.3 브레이크 페달 신호 검증</h3>
        <p style="margin:0">페달 위치 센서는 두 채널로 읽고, 두 값이 허용 범위를 벗어난 상태가 이어지면 고장으로 판정한다.</p>
        <div class="req"><div><b>ID</b><span>REQ-BRK-012</span></div><div><b>요구사항</b><span>두 채널 차이가 50ms 넘게 허용 범위를 벗어나면 고장으로 판정한다.</span></div><div><b>안전 등급</b><span>ASIL D</span></div>
          <div><b>검증 기준</b><span>단위 시험에서 구조 커버리지 <span class="word"><span class="selbox"></span>MC/DC</span> 100%를 달성한다.</span></div></div>
        <p style="margin:0">고장으로 판정하면 경고등을 켜고 고장 코드를 저장한다. 판정 지연은 시험 결과표 TC-BRK-003에서 확인한다.</p>
      </div></div></div>` },
  issue: { app: 'browser', ico: ['#2F6FE4', '이슈'], title: '결함 등록 — 사내 이슈 관리 — 브라우저', body: browser('issue.example.com/BCM/new', `
    <div class="issue"><h3>결함 등록 · BCM</h3>
      <div class="row"><label>프로젝트</label><div class="in">가상자동차 BCM</div></div>
      <div class="row"><label>제목</label><div class="in">[BCM] 두 채널 불일치 판정이 50ms보다 늦게 남</div></div>
      <div class="row"><label>심각도</label><div><span class="chip">높음</span></div></div>
      <div class="row"><label>설명</label><div class="in area"><span class="snip"></span><span class="caret" style="display:inline-block;width:1.5px;height:18px;background:#1F2328;vertical-align:-3px"></span></div></div>
      <div class="btns"><span>취소</span><span class="pri">등록</span></div></div>`) },
  secret: { app: 'doc', ico: ['#2B5CC8', '문서'], title: 'XY방산_납품문서_검토.docx — 문서 편집기', body: `
    <div class="doc secret"><div class="ribbon"><span>파일</span><span class="on">홈</span><span>삽입</span><span>검토</span></div>
      <div class="sheetwrap"><div class="page"><span class="stamp">대외비</span><h3>XY방산 시험장비 납품 문서 검토 의견</h3>
        <p>1. 시험 절차서 3.2절의 장비 교정 주기가 계약서와 다름.</p><p>2. 납품 목록의 소프트웨어 버전 표기를 통일할 것.</p><p>3. 인수 시험 결과 요약표에 판정 기준을 추가할 것.</p></div></div></div>` }
}

// ── 화면 만들기 ────────────────────────────────────────────
const deskEl = $('#desk')
const windowsEl = $('#windows')
const wins = {}
for (const [id, spec] of Object.entries(WINDOWS)) {
  const el = document.createElement('div')
  el.className = 'win' + (spec.dark ? ' dark' : '')
  el.innerHTML = `<div class="titlebar"><span class="ico" style="background:${spec.ico[0]};${spec.ico[1].length > 2 ? 'font-size:9px' : ''}">${spec.ico[1]}</span><span class="title">${spec.title}</span>${TITLE_CTL}</div><div class="body">${spec.body}</div>`
  windowsEl.appendChild(el)
  wins[id] = { id, el, app: spec.app, used: false }
}

// 작업 표시줄
const TASK_APPS = [
  ['start', '#7FB6FF', '●'],
  ['search', null, null],
  ['files', '#E8B23A', '폴더'],
  ['browser', '#2F6FE4', '웹'],
  ['code', '#3B7BEA', '&lt;/&gt;'],
  ['sheet', '#1E8E4F', '표'],
  ['memo', '#5B6577', '메모'],
  ['doc', '#2B5CC8', '문서'],
  ['pdf', '#C7362F', 'PDF'],
  ['msg', '#D9538E', '메'],
  ['ttree', '#1F8A57', 'T']
]
$('#taskbar').innerHTML = `<div class="tb-apps">${TASK_APPS.map(([id, color, label]) =>
  id === 'search'
    ? '<div class="tb-search">검색</div>'
    : `<div class="tb-app" data-app="${id}"><span class="ico" style="background:${color};${label.length > 2 ? 'font-size:8px' : ''}${id === 'start' ? ';border-radius:50%;width:22px;height:22px;font-size:9px;color:#0E2A4A' : ''}">${label}</span></div>`
).join('')}</div>
  <div class="tb-tray"><span>^</span><span class="tray-sm">S</span><span class="ime">가</span><div class="tb-clock"><div class="tb-time">오전 9:00</div><div>2026-11-16</div></div></div>`
const taskApp = Object.fromEntries($$('.tb-app').map((e) => [e.dataset.app, e]))
const tbTime = $('.tb-time')

// Sure-Mate 층
const barEl = $('#bar')
barEl.src = CACHE + 'ui/' + ui.bar.parts.bar.file
const palEl = $('#pal')
const palImgs = {}
for (const name of Object.keys(ui).filter((k) => k.startsWith('palette-') || k === 'confirm')) {
  const i = img(ui[name].parts.win.file)
  i.style.display = 'none'
  palEl.appendChild(i)
  palImgs[name] = i
}
$('#pal > img').remove()
const cardEl = $('#card')
cardEl.src = CACHE + 'ui/' + ui.card.parts.card.file
const petLooks = {}
const bubbles = {}
for (const name of ['pet-stand', 'pet-sit', 'pet-sleep', 'pet-copied', 'pet-unmask', 'pet-nudge']) {
  const p = ui[name].parts.sprite
  const i = img(p.file)
  i.className = 'pet-img'
  $('#suremate').appendChild(i)
  petLooks[name] = { el: i, part: p, dpr: ui[name].dpr }
  if (ui[name].parts.bubble) {
    const b = ui[name].parts.bubble
    const bi = img(b.file)
    bi.className = 'bubble-img'
    $('#suremate').appendChild(bi)
    bubbles[name] = { el: bi, part: b, sprite: p, dpr: ui[name].dpr }
  }
}
$('#pet').remove()
$('#bubble').remove()
for (const i of $$('#intro .mate, #outro .mate')) i.src = CACHE + 'ui/' + ui['pet-stand'].parts.sprite.file

// 커서(화살표·I 모양)
const cursorEl = $('#cursor')
const CURSOR_ARROW = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 2.5 L4 21 L8.6 16.8 L11.8 24 L14.9 22.6 L11.8 15.6 L18 15.6 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'
const CURSOR_TEXT = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M9 3 h3 l1 1 l1 -1 h3 M13 4 v18 M9 23 h3 l1 -1 l1 1 h3" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M9 3 h3 l1 1 l1 -1 h3 M13 4 v18 M9 23 h3 l1 -1 l1 1 h3" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/></svg>'
const ripple = document.createElement('div')
ripple.className = 'ripple'
$('#marks').appendChild(ripple)
const markEls = [0, 1, 2].map(() => {
  const m = document.createElement('div')
  m.className = 'mark'
  $('#marks').appendChild(m)
  return m
})

// 위쪽 띠
const capEls = $$('#captions .cap')
const keysEl = $('#keys')
const clockTime = $('#clock-time')
$('.outro-keys').innerHTML = keycaps(['Ctrl', 'Alt', 'Space'])
function keycaps(keys) {
  return keys.map((k) => `<span class="key${k.length > 4 ? ' wide' : ''}">${k}</span>`).join('<span class="plus">+</span>')
}

// 메모 줄 너비(선택 표시용), 작업 표시줄 칸 자리(창 내리기 목표)
await document.fonts.ready
await Promise.all([...$$('img')].map((i) => i.decode().catch(() => {})))
let memoLineW = memoLines.map(() => 0)
const deskRect = deskEl.getBoundingClientRect()
const taskPos = Object.fromEntries(Object.entries(taskApp).map(([id, e]) => {
  const r = e.getBoundingClientRect()
  return [id, { x: r.x - deskRect.x + r.width / 2, y: r.y - deskRect.y + r.height / 2 }]
}))

// ── 프레임마다 쓰는 도구 ──────────────────────────────────────
let camZ = 1
/** 장면 안 목표(단추·글자 칸)의 바탕화면 좌표. 처음에 한 번 그려 보고 잰다(아래 PROBE 재기) */
const PROBE = {}
function deskPos(el) {
  const d = deskEl.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { x: (r.x - d.x) / camZ, y: (r.y - d.y) / camZ, w: r.width / camZ, h: r.height / camZ }
}
function placeWin(id, r) {
  const w = wins[id]
  w.used = true
  const { el } = w
  css(el, 'display', 'flex')
  css(el, 'left', `${r.x}px`)
  css(el, 'top', `${r.y}px`)
  css(el, 'width', `${r.w}px`)
  css(el, 'height', `${r.h}px`)
  css(el, 'zIndex', String(r.z ?? 1))
  css(el, 'opacity', String(r.op ?? 1))
  css(el, 'transform', r.tf ?? 'none')
  cls(el, 'focus', Boolean(r.focus))
}
/** 창이 열리는 움직임(작게 → 제 크기, 투명 → 보임) */
const openTf = (t, t0, d = 0.22) => {
  const p = appOut(seg(t, t0, t0 + d))
  return { op: p, tf: `scale(${lerp(0.94, 1, p)})` }
}
/** 작업 표시줄 칸으로 내려가기(p=1이면 다 내려감) */
function minimizeTf(id, r, p) {
  const target = taskPos[wins[id].app]
  const cx = r.x + r.w / 2
  const cy = r.y + r.h
  const q = inOut(p)
  return { op: 1 - q, tf: `translate(${(target.x - cx) * q}px, ${(target.y - cy) * q}px) scale(${lerp(1, 0.06, q)})` }
}
const R = (x, y, w, h) => ({ x, y, w, h })
const LAYOUT = {
  saved: { code: R(10, 10, 884, 832), sheet: R(902, 10, 632, 444), wiki: R(902, 462, 632, 380) },
  messy: { code: R(330, 150, 760, 520), sheet: R(40, 290, 640, 430), wiki: R(720, 36, 700, 470), msg: R(500, 230, 540, 430) }
}
let petState = null
function pet(look, foot, o = {}) {
  petState = { look, foot, ...o }
}
let bubbleState = null
function bubble(name, t0, t1) {
  bubbleState = { name, t0, t1 }
}
let palState = null
function palette(name, t0, hideAt = Infinity, o = {}) {
  palState = { name, t0, hideAt, ...o }
}
let cursorState = null
let rippleState = null
let marks = []
let selState = {}

/** 커서 경로: [[t, x, y, 모양?], …] (모양: 'a' 화살표, 'i' 글자) */
function cursorPath(t, pts) {
  if (t < pts[0][0] - 0.25 || t > pts[pts.length - 1][0] + 0.6) return
  const x = track(t, pts.map((p) => [p[0], p[1]]))
  const y = track(t, pts.map((p) => [p[0], p[2]]))
  let shape = 'a'
  for (const p of pts) if (t >= p[0] - 0.05 && p[3]) shape = p[3]
  const op = Math.min(seg(t, pts[0][0] - 0.25, pts[0][0]), 1 - seg(t, pts[pts.length - 1][0] + 0.3, pts[pts.length - 1][0] + 0.6))
  cursorState = { x, y, shape, op }
}
function click(t, t0, x, y) {
  if (t >= t0 && t < t0 + 0.5) rippleState = { x, y, p: seg(t, t0, t0 + 0.5) }
}
const markOn = (t, t0, t1, rect) => {
  const p = Math.min(appOut(seg(t, t0, t0 + 0.3)), 1 - seg(t, t1 - 0.3, t1))
  if (p > 0) marks.push({ ...rect, p })
}

// 영상 전체에서 쓰는 펫 자리: 작업 표시줄 위(용어 카드·말풍선과 겹치지 않는 곳)
const PET_FOOT = { x: 1100, y: LAY.workArea.height }
const pal = LAY.palette

// ── 장면 ─────────────────────────────────────────────────
const typed = (t, t0, dt, states) => {
  const i = Math.floor((t - t0) / dt)
  return i < 0 ? null : states[Math.min(states.length - 1, i)]
}
function typing(t0, dt, seqName) {
  const n = fx.palette.typing[seqName].length
  for (let i = 0; i < n; i++) cue(t0 + i * dt, 'type', 0.8)
  return (t) => {
    const i = Math.floor((t - t0) / dt)
    return i < 0 ? 'palette-empty' : `palette-${seqName}-${Math.min(n - 1, i)}`
  }
}

const SCENES = []
function scene(start, end, draw, cam) {
  SCENES.push({ start, end, draw, cam })
}

// S1 09:00 출근: 팔레트에 '출근' → Ttree
{
  const a = T.s1
  press(a + 1.0, ['Ctrl', 'Alt', 'Space'])
  cue(a + 1.05, 'open')
  cue(a + 1.1, 'hop', 0.6)
  const pal1 = typing(a + 1.55, 0.16, 'ttree')
  press(a + 2.9, ['Enter'])
  cue(a + 3.05, 'window')
  cue(a + 4.45, 'click')
  cue(a + 4.5, 'ding')
  const ttree = R(560, 150, 430, 470)
  scene(a, T.s2, (t) => {
    const btn = PROBE.ttreeBtn ?? { x: 0, y: 0 }
    pet(t < a + 1.1 ? 'pet-sleep' : 'pet-stand', PET_FOOT, { hop: a + 1.1 })
    if (t >= a + 1.05) palette(pal1(t), a + 1.05, a + 2.95)
    if (t >= a + 3.05) {
      placeWin('ttree', { ...ttree, z: 10, focus: true, ...openTf(t, a + 3.05) })
      const done = t >= a + 4.5
      const el = wins.ttree.el
      cls($('.state', el), 'on', done)
      text($('.state strong', el), done ? '근무 중' : '근무 전')
      text($('.since', el), done ? '오전 9:00부터 · 오늘 근무 시작' : '아직 출근 기록이 없어요')
      cls($('.go', el), 'done', done)
      text($('.go', el), done ? '근무 시작 완료 · 09:00' : '근무 시작')
    }
    cursorPath(t, [[a + 3.4, 980, 760], [a + 4.3, btn.x + 30, btn.y + 4], [a + 6.4, btn.x + 70, btn.y + 60]])
    click(t, a + 4.45, btn.x + 30, btn.y + 4)
  }, (t) => track(t, [[a + 3.5, [1, 800, 450]], [a + 4.2, [1.38, 790, 400]], [T.s2, [1.38, 790, 400]]]))
}

// S2 09:05 창 배치 불러오기(Ctrl+Alt+1)
{
  const a = T.s2
  press(a + 2.0, ['Ctrl', 'Alt', '1'])
  cue(a + 2.08, 'whoosh')
  scene(a, T.s3, (t) => {
    pet('pet-stand', PET_FOOT)
    const order = ['code', 'sheet', 'wiki']
    order.forEach((id, i) => {
      const p = inOut(seg(t, a + 2.08 + i * 0.06, a + 2.08 + i * 0.06 + 0.62))
      const from = LAYOUT.messy[id]
      const to = LAYOUT.saved[id]
      placeWin(id, { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), w: lerp(from.w, to.w, p), h: lerp(from.h, to.h, p), z: t < a + 2.08 ? [3, 2, 4][i] : [6, 5, 7][i], focus: id === 'code' && t > a + 2.4 })
    })
    placeWin('msg', { ...LAYOUT.messy.msg, z: t < a + 2.08 ? 8 : 1, focus: t < a + 2.08 })
  }, () => [1, 800, 450])
}

// S3 10:30 회의록 정리 → 확인 화면(가명) → AI 채팅
{
  const a = T.s3
  const memoR = R(250, 70, 800, 420)
  const textX = memoR.x + 1 + 22
  const textY = memoR.y + 34 + 30 + 16
  press(a + 2.3, ['Ctrl', 'Alt', 'Space'])
  cue(a + 2.35, 'open')
  const pal3 = typing(a + 2.8, 0.14, 'meeting')
  press(a + 4.2, ['Enter'])
  cue(a + 4.3, 'swap', 0.6)
  press(a + 8.4, ['Enter'])
  cue(a + 8.6, 'hop')
  cue(a + 8.62, 'bubble')
  cue(a + 9.0, 'window')
  press(a + 10.0, ['Ctrl', 'V'])
  cue(a + 10.06, 'paste')
  press(a + 10.8, ['Enter'])
  cue(a + 10.9, 'send')
  const aiR = R(180, 30, 1100, 800)
  const blocksAt = (t) => Math.floor(seg(t, a + 11.3, a + 13.6) * answerBlocks.length + (t >= a + 11.3 ? 1 : 0))
  for (let i = 0; i < answerBlocks.length; i++) cue(a + 11.3 + (i * 2.3) / answerBlocks.length, 'tick', 0.35)
  scene(a, T.s4, (t) => {
    for (const [id, r] of Object.entries(LAYOUT.saved)) placeWin(id, { ...r, z: 2 })
    placeWin('memo', { ...memoR, z: 5, focus: t < a + 9.0 })
    // 드래그 선택(a+0.6 → a+1.6)
    const sp = seg(t, a + 0.6, a + 1.6)
    selState.memo = sp
    cursorPath(t, [[a + 0.3, textX + 40, textY + 60, 'i'], [a + 0.6, textX - 2, textY + 6, 'i'], [a + 1.6, textX + memoLineW[memoLineW.length - 1] + 4, textY + 30 * (memoLines.length - 1) + 20, 'i'], [a + 1.9, textX + memoLineW[memoLineW.length - 1] + 30, textY + 30 * memoLines.length + 30, 'a']])
    if (t >= a + 2.35) palette(t < a + 4.3 ? pal3(t) : 'confirm', a + 2.35, a + 8.45, { swapAt: a + 4.3 })
    // 확인 화면의 바뀐 이름 칩과 미리 보기
    const chips = ui.confirm.chips
    const pv = ui.confirm.previewBox
    markOn(t, a + 5.3, a + 7.2, { x: pal.x + chips.x - 8, y: pal.y + chips.y - 6, w: chips.width + 16, h: chips.height + 12 })
    markOn(t, a + 6.2, a + 8.0, { x: pal.x + pv.x - 4, y: pal.y + pv.y - 4, w: pv.width + 8, h: pv.height + 8 })
    pet(t >= a + 8.6 && t < a + 12.6 ? 'pet-copied' : 'pet-stand', PET_FOOT, { hop: a + 8.6 })
    if (t >= a + 8.6) bubble('pet-copied', a + 8.6, a + 12.6)
    if (t >= a + 9.0) {
      placeWin('ai', { ...aiR, z: 8, focus: true, ...openTf(t, a + 9.0) })
      const el = wins.ai.el
      const comp = $('.composer', el)
      const pasted = t >= a + 10.06 && t < a + 10.9
      cls(comp, 'empty', !pasted)
      cls(comp, 'ready', pasted)
      html(comp, (pasted ? tokWrap(promptLines(4)) : '<span class="ph">메시지를 입력하세요</span>') + '<span class="send"></span>')
      const sent = t >= a + 10.9
      css($('.hello', el), 'display', sent ? 'none' : 'block')
      css($('.user', el), 'display', sent ? 'block' : 'none')
      css($('.bot', el), 'display', t >= a + 11.3 ? 'grid' : 'none')
      const shown = blocksAt(t)
      $$('.blk', el).forEach((b, i) => css(b, 'opacity', i < shown ? '1' : '0'))
    }
    // 토큰 강조(영상용 표시)
    const lit = Math.min(seg(t, a + 13.4, a + 13.8), 1 - seg(t, a + 16.4, a + 16.9))
    $$('.answer .tok', wins.ai.el).forEach((e) => css(e, 'boxShadow', lit > 0 ? `0 0 0 ${2 * lit}px rgba(60,200,180,${0.9 * lit}), 0 0 0 ${6 * lit}px rgba(60,200,180,${0.22 * lit})` : 'none'))
    $$('.answer .tok', wins.ai.el).forEach((e) => css(e, 'background', lit > 0 ? `rgba(60,200,180,${0.18 * lit})` : 'transparent'))
  }, (t) => track(t, [[a + 4.6, [1, 800, 450]], [a + 5.3, [1.62, pal.x + 360, pal.y + 250]], [a + 7.9, [1.62, pal.x + 360, pal.y + 250]], [a + 8.5, [1, 800, 450]], [a + 12.0, [1, 800, 450]], [a + 12.7, [1.42, 720, 470]], [T.s4, [1.42, 720, 470]]]))
}

// S4 10:40 AI가 쓴 글 복사 → '가명 되돌려줘' → 보고서에 붙여넣기
{
  const a = T.s4
  const aiR = R(180, 30, 1100, 800)
  const docR = R(240, 44, 1040, 790)
  press(a + 1.6, ['Ctrl', 'C'])
  press(a + 2.3, ['Ctrl', 'Alt', 'Space'])
  cue(a + 2.35, 'open')
  const pal4 = typing(a + 2.75, 0.12, 'unmask')
  press(a + 4.3, ['Enter'])
  cue(a + 4.5, 'hop')
  cue(a + 4.52, 'bubble')
  cue(a + 5.2, 'click')
  cue(a + 5.3, 'window', 0.7)
  press(a + 6.0, ['Ctrl', 'V'])
  cue(a + 6.06, 'paste')
  cue(a + 6.5, 'ding', 0.8)
  scene(a, T.s5, (t) => {
    for (const [id, r] of Object.entries(LAYOUT.saved)) placeWin(id, { ...r, z: 2 })
    placeWin('memo', { x: 250, y: 70, w: 800, h: 420, z: 3 })
    const el = wins.ai.el
    placeWin('ai', { ...aiR, z: 8, focus: t < a + 5.3 })
    css($('.hello', el), 'display', 'none')
    css($('.user', el), 'display', 'block')
    css($('.bot', el), 'display', 'grid')
    $$('.blk', el).forEach((b) => css(b, 'opacity', '1'))
    $$('.answer .tok', el).forEach((e) => {
      css(e, 'boxShadow', 'none')
      css(e, 'background', 'transparent')
    })
    selState.answer = seg(t, a + 0.5, a + 1.25)
    const ansR = PROBE.answer ?? { x: 0, y: 0, w: 0, h: 0 }
    const ans = { x: ansR.x, y: ansR.y }
    cursorPath(t, [[a + 0.2, ans.x + 120, ans.y + 80, 'i'], [a + 0.5, ans.x - 4, ans.y + 2, 'i'], [a + 1.25, ans.x + ansR.w * 0.62, ans.y + ansR.h + 2, 'i'], [a + 4.8, ans.x + 560, ans.y + 430, 'a'], [a + 5.2, taskPos.doc.x, taskPos.doc.y - 2, 'a'], [a + 6.4, taskPos.doc.x + 30, taskPos.doc.y - 120, 'a']])
    click(t, a + 5.2, taskPos.doc.x, taskPos.doc.y - 2)
    if (t >= a + 2.35) palette(pal4(t), a + 2.35, a + 4.35)
    pet(t >= a + 4.5 && t < a + 8.5 ? 'pet-unmask' : 'pet-stand', PET_FOOT, { hop: a + 4.5 })
    if (t >= a + 4.5) bubble('pet-unmask', a + 4.5, a + 8.5)
    if (t >= a + 5.3) {
      placeWin('doc', { ...docR, z: 9, focus: true, ...openTf(t, a + 5.3, 0.2) })
      css($('.pasted', wins.doc.el), 'display', t >= a + 6.06 ? 'block' : 'none')
      const lit = Math.min(seg(t, a + 6.5, a + 6.9), 1 - seg(t, a + 8.6, a + 9.0))
      $$('.rest', wins.doc.el).forEach((e) => {
        css(e, 'background', lit > 0 ? `rgba(255,212,71,${0.55 * lit})` : 'transparent')
        css(e, 'boxShadow', lit > 0 ? `0 0 0 ${2 * lit}px rgba(255,212,71,${0.9 * lit})` : 'none')
      })
    }
  // 확대는 말풍선(바닥 위 725~787) 위쪽만 담는다: 말풍선이 화면 가장자리에서 잘려 보이지 않게
  }, (t) => track(t, [[a, [1.42, 720, 470]], [a + 0.1, [1.42, 720, 470]], [a + 0.6, [1, 800, 450]], [a + 6.2, [1, 800, 450]], [a + 6.8, [1.45, 760, 405]], [T.s5, [1.45, 760, 405]]]))
}

// S5 13:00 'MC/DC' 선택 → Ctrl+Alt+W 용어 카드
{
  const a = T.s5
  const pdfR = R(140, 26, 1080, 808)
  press(a + 1.7, ['Ctrl', 'Alt', 'W'])
  cue(a + 0.9, 'click', 0.6)
  cue(a + 1.0, 'click', 0.6)
  cue(a + 1.75, 'card')
  scene(a, T.s6, (t) => {
    for (const [id, r] of Object.entries(LAYOUT.saved)) placeWin(id, { ...r, z: 2 })
    placeWin('pdf', { ...pdfR, z: 8, focus: true })
    pet('pet-stand', PET_FOOT)
    const word = $('.word', wins.pdf.el)
    const wordPos = PROBE.word ?? { x: 0, y: 0 }
    css($('.selbox', word), 'opacity', t >= a + 1.0 ? '1' : '0')
    cursorPath(t, [[a + 0.2, wordPos.x + 200, wordPos.y + 140, 'a'], [a + 0.85, wordPos.x + 22, wordPos.y + 10, 'i'], [a + 2.6, wordPos.x + 40, wordPos.y + 60, 'i']])
    click(t, a + 0.95, wordPos.x + 22, wordPos.y + 10)
    if (t >= a + 1.75) {
      const p = appOut(seg(t, a + 1.75, a + 1.95))
      const out = seg(t, a + 6.5, a + 6.75)
      css(cardEl, 'display', 'block')
      css(cardEl, 'opacity', String(p * (1 - out)))
      css(cardEl, 'transform', `translateX(${lerp(10, 0, p)}px)`)
    }
  }, (t) => track(t, [[a + 2.1, [1, 800, 450]], [a + 2.8, [1.36, 1010, 560]], [T.s6, [1.36, 1010, 560]]]))
}

// S6 14:30 결함 등록 설명 칸 → '!이슈' 상용구
{
  const a = T.s6
  const isR = R(170, 26, 1060, 808)
  cue(a + 0.5, 'click')
  press(a + 1.2, ['Ctrl', 'Alt', 'Space'])
  cue(a + 1.25, 'open')
  const pal6 = typing(a + 1.65, 0.15, 'snippet')
  press(a + 2.75, ['Enter'])
  cue(a + 2.95, 'paste')
  scene(a, T.s7, (t) => {
    for (const [id, r] of Object.entries(LAYOUT.saved)) placeWin(id, { ...r, z: 2 })
    placeWin('issue', { ...isR, z: 8, focus: true })
    pet('pet-stand', PET_FOOT)
    const el = wins.issue.el
    const area = $('.area', el)
    cls(area, 'focus', t >= a + 0.5)
    html($('.snip', el), t >= a + 2.95 ? esc(fx.snippet).replace(/\n/g, '<br>') : '')
    css($('.caret', area), 'opacity', t >= a + 0.5 && Math.floor((t - a) * 2) % 2 === 0 ? '1' : '0')
    const areaPos = PROBE.area ?? { x: 0, y: 0 }
    cursorPath(t, [[a + 0.1, areaPos.x + 160, areaPos.y + 160, 'a'], [a + 0.45, areaPos.x + 20, areaPos.y + 20, 'i'], [a + 1.0, areaPos.x + 30, areaPos.y + 80, 'i']])
    click(t, a + 0.5, areaPos.x + 20, areaPos.y + 20)
    if (t >= a + 1.25) palette(pal6(t), a + 1.25, a + 2.8)
  }, (t) => track(t, [[a + 3.1, [1, 800, 450]], [a + 3.8, [1.38, 620, 470]], [T.s7, [1.38, 620, 470]]]))
}

// S7 16:00 화면 감추기(Ctrl+Alt+H 두 번)
{
  const a = T.s7
  const R7 = { doc: R(100, 36, 780, 790), wiki: R(820, 60, 620, 420), msg: R(760, 130, 560, 560), secret: R(420, 210, 700, 560) }
  press(a + 1.6, ['Ctrl', 'Alt', 'H'])
  cue(a + 1.66, 'down')
  press(a + 4.8, ['Ctrl', 'Alt', 'H'])
  cue(a + 4.86, 'up')
  scene(a, T.s8, (t) => {
    pet('pet-stand', PET_FOOT)
    placeWin('doc', { ...R7.doc, z: 2, focus: t >= a + 1.9 && t < a + 4.9 })
    css($('.pasted', wins.doc.el), 'display', 'block')
    $$('.rest', wins.doc.el).forEach((e) => {
      css(e, 'background', 'transparent')
      css(e, 'boxShadow', 'none')
    })
    const down = seg(t, a + 1.66, a + 2.06) - seg(t, a + 4.86, a + 5.26)
    ;[['wiki', 3], ['msg', 4], ['secret', 5]].forEach(([id, z], i) => {
      const p = down > 0 ? clamp01(down * 1.0 - i * 0.04) : 0
      const r = R7[id]
      if (p >= 1) return
      placeWin(id, { ...r, z, focus: id === 'secret' && p === 0, ...(p > 0 ? minimizeTf(id, r, p) : {}) })
    })
  }, () => [1, 800, 450])
}

// S8 17:10 쉬어 가기 말
{
  const a = T.s8
  cue(a + 1.0, 'hop')
  cue(a + 1.02, 'bubble')
  scene(a, T.outro + 0.6, (t) => {
    for (const [id, r] of Object.entries(LAYOUT.saved)) placeWin(id, { ...r, z: 2, focus: id === 'code' })
    pet(t >= a + 1.0 ? 'pet-nudge' : 'pet-stand', PET_FOOT, { hop: a + 1.0 })
    if (t >= a + 1.0) bubble('pet-nudge', a + 1.0, a + 5.0)
  }, (t) => track(t, [[a + 1.3, [1, 800, 450]], [a + 2.0, [1.75, 1060, 690]], [T.outro + 0.6, [1.75, 1060, 690]]]))
}

// 처음·끝 카드
cue(0.35, 'hop', 0.8)
cue(T.outro + 0.75, 'hop', 0.8)
press(T.outro + 1.6, ['Ctrl', 'Alt', 'Space'])
cue(T.outro + 2.6, 'hop', 0.6)

// ── 그리기 ─────────────────────────────────────────────────
function renderBand(t) {
  // 자막: 새 줄은 아래에서 올라오고 이전 줄은 위로 빠진다
  let i = -1
  for (let k = 0; k < CAPTIONS.length; k++) if (t >= CAPTIONS[k][0]) i = k
  const show = i >= 0 && t < T.outro
  capEls.forEach((e, k) => css(e, 'opacity', '0'))
  if (show) {
    const [t0, clock, line] = CAPTIONS[i]
    const cur = capEls[i % 2]
    const prev = capEls[(i + 1) % 2]
    const p = appOut(seg(t, t0, t0 + 0.42))
    html(cur, line)
    css(cur, 'opacity', String(p))
    css(cur, 'transform', `translateY(${lerp(26, 0, p)}px)`)
    if (i > 0 && p < 1) {
      html(prev, CAPTIONS[i - 1][2])
      css(prev, 'opacity', String(1 - seg(t, t0, t0 + 0.22)))
      css(prev, 'transform', `translateY(${lerp(0, -22, outCubic(seg(t, t0, t0 + 0.22)))}px)`)
    }
    text(clockTime, clock)
    const [h, m] = clock.split(':').map(Number)
    text(tbTime, `${h < 12 ? '오전' : '오후'} ${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}`)
  }
  // 키
  let ev = null
  for (const e of KEYS) if (t >= e.t - 0.4 && t <= e.t + 1.0) ev = e
  if (ev && t < T.outro) {
    html(keysEl, keycaps(ev.keys))
    const appear = appOut(seg(t, ev.t - 0.4, ev.t - 0.22))
    const gone = seg(t, ev.t + 0.75, ev.t + 1.0)
    css(keysEl, 'opacity', String(appear * (1 - gone)))
    css(keysEl, 'transform', `scale(${lerp(0.92, 1, appear)})`)
    const capsEls = $$('.key', keysEl)
    capsEls.forEach((k, j) => cls(k, 'down', t >= ev.t - (ev.keys.length - 1 - j) * 0.08 && t < ev.t + 0.22))
  } else {
    css(keysEl, 'opacity', '0')
  }
}

function renderDesk(t) {
  for (const w of Object.values(wins)) w.used = false
  petState = bubbleState = palState = cursorState = rippleState = null
  marks = []
  selState = {}
  css(cardEl, 'display', 'none')
  const s = SCENES.find((x) => t >= x.start && t < x.end) ?? (t < T.s1 ? SCENES[0] : SCENES[SCENES.length - 1])
  s.draw(t)
  const [z, cx, cy] = s.cam(t)
  // 카메라: 바탕화면 밖이 보이지 않게 가운데를 묶는다
  const hx = 800 / z
  const hy = 450 / z
  const x = Math.max(hx, Math.min(1600 - hx, cx))
  const y = Math.max(hy, Math.min(900 - hy, cy))
  camZ = z
  css($('#cam'), 'transform', `translate(${800 - x * z}px, ${450 - y * z}px) scale(${z})`)

  for (const w of Object.values(wins)) if (!w.used) css(w.el, 'display', 'none')

  // 바
  const bar = LAY.bar
  css(barEl, 'display', 'block')
  css(barEl, 'left', `${bar.x}px`)
  css(barEl, 'top', `${bar.y}px`)
  css(barEl, 'width', `${bar.width}px`)
  css(barEl, 'height', `${bar.height}px`)

  // 팔레트(실제 화면): 열 때 200ms 들어오고, 닫을 때 120ms 사라진다
  for (const i of Object.values(palImgs)) css(i, 'display', 'none')
  if (palState && t < palState.hideAt + 0.12) {
    const pin = appOut(seg(t, palState.t0, palState.t0 + 0.2))
    const pout = seg(t, palState.hideAt, palState.hideAt + 0.12)
    css(palEl, 'display', 'block')
    css(palEl, 'left', `${pal.x}px`)
    css(palEl, 'top', `${pal.y}px`)
    css(palEl, 'opacity', String(pin * (1 - pout)))
    css(palEl, 'transform', `translateY(${lerp(-6, 0, pin)}px) scale(${lerp(0.985, 1, pin)})`)
    css(palImgs[palState.name], 'display', 'block')
  } else {
    css(palEl, 'display', 'none')
  }
  // 카드 자리(용어 카드)
  const cw = LAY.cardWindow
  css(cardEl, 'left', `${cw.x}px`)
  css(cardEl, 'top', `${cw.y}px`)
  css(cardEl, 'width', `${cw.width}px`)
  css(cardEl, 'height', `${cw.height}px`)

  // 말랑 메이트와 말풍선
  for (const l of Object.values(petLooks)) css(l.el, 'display', 'none')
  for (const b of Object.values(bubbles)) css(b.el, 'display', 'none')
  if (petState) {
    const look = petLooks[petState.look]
    const part = look.part
    const size = LAY.pet.size
    const boxX = petState.foot.x - size / 2
    const boxY = petState.foot.y + LAY.pet.floorTop
    const dy = petState.hop !== undefined ? hopY(t, petState.hop) : 0
    const land = petState.hop !== undefined ? seg(t, petState.hop + 0.36, petState.hop + 0.5) : 1
    const squash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * 0.08 : 0
    const breathe = Math.sin(t * 2.4) * 0.012
    css(look.el, 'display', 'block')
    css(look.el, 'left', `${boxX + (part.clip.x - part.box.x)}px`)
    css(look.el, 'top', `${boxY + (part.clip.y - part.box.y)}px`)
    css(look.el, 'width', `${part.clip.width}px`)
    css(look.el, 'height', `${part.clip.height}px`)
    css(look.el, 'transformOrigin', `${part.box.x - part.clip.x + size / 2}px ${part.box.y - part.clip.y + size}px`)
    css(look.el, 'transform', `translateY(${dy}px) scale(${1 + squash}, ${1 - squash + breathe})`)
    if (bubbleState && t < bubbleState.t1) {
      const b = bubbles[bubbleState.name]
      const bp = b.part
      const pin = appOut(seg(t, bubbleState.t0, bubbleState.t0 + 0.2))
      const pout = seg(t, bubbleState.t1 - 0.15, bubbleState.t1)
      css(b.el, 'display', 'block')
      css(b.el, 'left', `${boxX + (bp.clip.x - b.sprite.box.x)}px`)
      css(b.el, 'top', `${boxY + (bp.clip.y - b.sprite.box.y) + dy * 0.6}px`)
      css(b.el, 'width', `${bp.clip.width}px`)
      css(b.el, 'height', `${bp.clip.height}px`)
      css(b.el, 'transformOrigin', `${b.sprite.box.x + size / 2 - bp.clip.x}px ${bp.clip.height}px`)
      css(b.el, 'opacity', String(pin * (1 - pout)))
      css(b.el, 'transform', `scale(${lerp(0.9, 1, pin)})`)
    }
  }

  // 메모 선택
  const memoSel = selState.memo ?? (t >= T.s3 + 1.6 && t < T.s4 ? 1 : 0)
  $$('.ln', wins.memo.el).forEach((ln, i) => {
    const n = memoLineW.length
    const f = clamp01(memoSel * n - i)
    css($('.selbox', ln), 'width', `${f * memoLineW[i]}px`)
  })
  const ansSel = selState.answer ?? 0
  const ansBox = $('.answer > .selbox', wins.ai.el)
  css(ansBox, 'height', `${ansSel * $('.answer', wins.ai.el).offsetHeight}px`)

  // 영상용 표시
  markEls.forEach((m, i) => {
    const k = marks[i]
    if (!k) return css(m, 'opacity', '0')
    css(m, 'left', `${k.x}px`)
    css(m, 'top', `${k.y}px`)
    css(m, 'width', `${k.w}px`)
    css(m, 'height', `${k.h}px`)
    css(m, 'opacity', String(k.p))
    css(m, 'transform', `scale(${lerp(1.04, 1, k.p)})`)
  })
  if (rippleState) {
    css(ripple, 'left', `${rippleState.x}px`)
    css(ripple, 'top', `${rippleState.y}px`)
    css(ripple, 'opacity', String(1 - rippleState.p))
    css(ripple, 'transform', `scale(${lerp(0.4, 1.6, outCubic(rippleState.p))})`)
  } else css(ripple, 'opacity', '0')

  // 커서
  if (cursorState && cursorState.op > 0) {
    css(cursorEl, 'display', 'block')
    html(cursorEl, cursorState.shape === 'i' ? CURSOR_TEXT : CURSOR_ARROW)
    css(cursorEl, 'opacity', String(cursorState.op))
    const off = cursorState.shape === 'i' ? 13 : 4
    css(cursorEl, 'transform', `translate(${cursorState.x - off}px, ${cursorState.y - (cursorState.shape === 'i' ? 13 : 2)}px) scale(${1 / Math.sqrt(camZ)})`)
  } else css(cursorEl, 'display', 'none')

  // 작업 표시줄: 열린 창(점)·앞 창(파란 줄)
  const running = new Set(Object.values(wins).filter((w) => w.used).map((w) => w.app))
  const front = Object.values(wins).filter((w) => w.used && w.el.classList.contains('focus')).map((w) => w.app)[0]
  for (const [id, e] of Object.entries(taskApp)) {
    cls(e, 'run', running.has(id))
    cls(e, 'on', id === front)
  }

  // 장면 사이: 화면이 잠깐 어두워졌다 밝아지며 시간이 넘어간다
  let dim = 0
  for (const c of CUTS) dim = Math.max(dim, 1 - Math.abs(t - c) / 0.24)
  css($('#dim'), 'opacity', String(0.9 * clamp01(dim)))
}

function renderCards(t) {
  // 처음: 0~2.5초 카드, 2.5~3.0초 본 화면으로
  const intro = $('#intro')
  const outro = $('#outro')
  const iOut = seg(t, 2.45, 3.0)
  css(intro, 'opacity', String(1 - iOut))
  css(intro, 'display', t < 3.0 ? 'grid' : 'none')
  const im = $('#intro .mate')
  const drop = appOut(seg(t, 0.15, 0.6))
  css(im, 'transform', `translateY(${lerp(-90, 0, drop) + hopY(t, 1.6, 22, 0.45)}px)`)
  css(im, 'opacity', String(seg(t, 0.15, 0.35)))
  css($('#intro .sticker'), 'opacity', String(appOut(seg(t, 0.25, 0.6))))
  css($('#intro h1'), 'opacity', String(appOut(seg(t, 0.45, 0.85))))
  css($('#intro h1'), 'transform', `translateY(${lerp(18, 0, appOut(seg(t, 0.45, 0.85)))}px)`)
  css($('#intro .sub'), 'opacity', String(appOut(seg(t, 0.7, 1.1))))
  css($('#intro .sub'), 'transform', `translateY(${lerp(14, 0, appOut(seg(t, 0.7, 1.1)))}px)`)

  const oIn = appOut(seg(t, T.outro, T.outro + 0.5))
  css(outro, 'display', t >= T.outro ? 'grid' : 'none')
  css(outro, 'opacity', String(oIn))
  const om = $('#outro .mate')
  css(om, 'transform', `translateY(${hopY(t, T.outro + 0.75, 26, 0.45) + hopY(t, T.outro + 2.6, 18, 0.4)}px)`)
  const ks = $$('.outro-keys .key')
  const kt = T.outro + 1.6
  ks.forEach((k, j) => cls(k, 'down', t >= kt - (ks.length - 1 - j) * 0.08 && t < kt + 0.22))
  css($('#outro h2'), 'transform', `translateY(${lerp(16, 0, appOut(seg(t, T.outro + 0.2, T.outro + 0.7)))}px)`)
  css($('#outro .file'), 'opacity', String(appOut(seg(t, T.outro + 0.9, T.outro + 1.3))))
  css($('#outro .fine'), 'opacity', String(appOut(seg(t, T.outro + 1.2, T.outro + 1.6))))

  // 본 화면(띠·모니터)
  const mainIn = appOut(seg(t, 2.5, 3.0)) * (1 - seg(t, T.outro, T.outro + 0.4))
  css($('#band'), 'opacity', String(mainIn))
  css($('#monitor'), 'opacity', String(mainIn))
  css($('#monitor'), 'transform', `scale(${lerp(0.97, 1, appOut(seg(t, 2.5, 3.0)))})`)
}

function render(t) {
  renderCards(t)
  if (t >= 2.4 && t < T.outro + 0.6) {
    renderBand(t)
    renderDesk(t)
  }
}

// 목표 자리 재기: 그 장면을 한 번 그려 본 뒤 바탕화면 좌표로 잰다(카메라 배율과 상관없다)
render(T.s1 + 3.5)
{
  const g = deskPos($('.go', wins.ttree.el))
  PROBE.ttreeBtn = { x: g.x + g.w / 2, y: g.y + g.h / 2 }
}
render(T.s3 + 0.5)
memoLineW = $$('.ln', wins.memo.el).map((l) => l.offsetWidth)
render(T.s3 + 16.0)
PROBE.answer = deskPos($('.answer', wins.ai.el))
render(T.s5 + 0.1)
PROBE.word = deskPos($('.word', wins.pdf.el))
render(T.s6 + 0.2)
{
  const r = deskPos($('.area', wins.issue.el))
  PROBE.area = { x: r.x + 14, y: r.y + 12 }
}

CUES.sort((x, y) => x.t - y.t)
window.__duration = DURATION
window.__cues = CUES
window.__render = render
window.__ready = true

const params = new URLSearchParams(location.search)
if (params.has('t')) render(Number(params.get('t')))
else if (params.has('play')) {
  const start = performance.now() - Number(params.get('play') || 0) * 1000
  const loop = () => {
    const t = (performance.now() - start) / 1000
    render(t % DURATION)
    requestAnimationFrame(loop)
  }
  loop()
} else render(T.s1 + 2.0)
