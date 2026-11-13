// Music bed and sound effects for the promo video, synthesized from scratch (no samples, so no licence to check).
// Reads .cache/cues.json (written by render.mjs from the scene timeline) and writes .cache/audio.wav (48 kHz stereo).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, '.cache')
const { duration, cues } = JSON.parse(readFileSync(join(CACHE, 'cues.json'), 'utf8'))
const SR = 48000
const N = Math.ceil((duration + 0.5) * SR)
const music = [new Float32Array(N), new Float32Array(N)]
const sfx = [new Float32Array(N), new Float32Array(N)]

// 같은 결과가 나오게 고정한 난수
let seed = 20261116
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const noise = () => rand() * 2 - 1
const TAU = Math.PI * 2
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

/** buf에 소리 하나를 더한다. fn(t, i) → 표본값(모노), pan -1..1 */
function add(bus, start, dur, fn, gain = 1, pan = 0) {
  const s0 = Math.max(0, Math.round(start * SR))
  const n = Math.min(N - s0, Math.round(dur * SR))
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n; i++) {
    const v = fn(i / SR, i)
    bus[0][s0 + i] += v * gl
    bus[1][s0 + i] += v * gr
  }
}

/** RBJ 바이쿼드 필터(한 번 쓰고 버리는 상태) */
function biquad(type, f, q = 0.707) {
  const w = (TAU * f) / SR
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  let b0, b1, b2
  if (type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
  else if (type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
  else [b0, b1, b2] = [alpha, 0, -alpha]
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d))

// ── 악기 ──────────────────────────────────────────────────
/** 부드러운 전자 피아노(FM): 맑은 어택과 빨리 사라지는 금속성 */
function ep(start, note, len, vel = 1, pan = 0) {
  const f = midi(note)
  add(music, start, len + 1.2, (t) => {
    const idx = 1.6 * Math.exp(-t * 4) + 0.25
    const tine = 0.18 * Math.exp(-t * 28) * Math.sin(TAU * f * 14 * t)
    // 두 번째 목소리는 3센트 높게(합창 느낌). 변조도 같은 주파수로 해야 1 Hz 아래로 처지는 성분이 생기지 않는다
    const body = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) + 0.6 * Math.sin(TAU * f * 1.0017 * t + idx * 0.8 * Math.sin(TAU * f * 1.0017 * t))
    const rel = t > len ? Math.exp(-(t - len) * 6) : 1
    return (body * 0.5 + tine) * env(t, 0.006, 1.6) * rel
  }, 0.075 * vel, pan)
}
/** 마림바 같은 짧은 뜯는 소리 */
function pluck(start, note, vel = 1, pan = 0) {
  const f = midi(note)
  add(music, start, 0.7, (t) => (Math.sin(TAU * f * t) * Math.exp(-t * 7) + 0.28 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 24)) * Math.min(1, t / 0.003), 0.04 * vel, pan)
}
function bass(start, note, len, vel = 1) {
  const f = midi(note)
  add(music, start, len + 0.12, (t) => {
    const a = Math.min(1, t / 0.012) * (t > len ? Math.exp(-(t - len) * 30) : 0.75 + 0.25 * Math.exp(-t * 6))
    return (Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 2 * f * t) + 0.08 * Math.sin(TAU * 3 * f * t)) * a
  }, 0.16 * vel)
}
function kick(start, vel = 1) {
  let ph = 0
  add(music, start, 0.32, (t) => {
    ph += (TAU * (46 + 74 * Math.exp(-t * 28))) / SR
    return Math.sin(ph) * Math.exp(-t * 11) + 0.08 * noise() * Math.exp(-t * 300)
  }, 0.30 * vel)
}
function clap(start, vel = 1) {
  const bp = biquad('bp', 1600, 0.9)
  add(music, start, 0.3, (t) => {
    const bursts = (t < 0.012 ? 1 : 0) + (t > 0.012 && t < 0.022 ? 0.8 : 0)
    return bp(noise()) * (Math.exp(-t * 22) + bursts * 0.6)
  }, 0.11 * vel, 0.1)
}
function hat(start, vel = 1) {
  // 4차 고역 통과(두 번 거른다): 낮은 쪽으로 새는 쉿 소리를 줄인다
  const hp1 = biquad('hp', 7500, 0.7)
  const hp2 = biquad('hp', 7500, 0.7)
  add(music, start, 0.08, (t) => hp2(hp1(noise())) * Math.exp(-t * 70), 0.035 * vel, 0.25)
}
function pad(start, notes, len, gain = 1) {
  const lp = biquad('lp', 1800, 0.6)
  add(music, start, len, (t) => {
    let v = 0
    for (const n of notes) {
      const f = midi(n)
      v += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.002 * t) + 0.12 * Math.sin(TAU * f * 3.001 * t)
    }
    const a = Math.min(1, t / 0.9) * Math.min(1, (len - t) / 0.8)
    return lp(v) * a
  }, 0.022 * gain)
}

// ── 곡: 104 BPM, Cmaj7 – Am7 – Fmaj7 – G7sus 반복 ──────────────────
const BPM = 104
const BEAT = 60 / BPM
const BAR = BEAT * 4
const GROOVE = 3.0 // 출근 장면부터 박자
const OUTRO = duration - 5.5
const CHORDS = [
  { root: 36, ep: [60, 64, 67, 71], arp: [72, 76, 79, 83] }, // Cmaj7
  { root: 33, ep: [57, 60, 64, 67], arp: [69, 72, 76, 79] }, // Am7
  { root: 29, ep: [57, 60, 64, 65], arp: [69, 72, 77, 81] }, // Fmaj7
  { root: 31, ep: [59, 62, 65, 67], arp: [71, 74, 79, 83] } // G7
]

// 처음 카드: 화음이 피어오르고 메이트가 떨어질 때 맑은 소리
pad(0, [60, 64, 67, 71], 3.4, 1.2)
ep(0.35, 76, 0.5, 0.8, 0.2)
ep(0.6, 79, 0.6, 0.7, -0.2)

const bars = Math.floor((OUTRO - GROOVE) / BAR)
for (let b = 0; b < bars; b++) {
  const t0 = GROOVE + b * BAR
  const c = CHORDS[b % 4]
  const calm = t0 < 11.0 // 출근 장면은 북 없이 가볍게
  // 전자 피아노 반주(당김음)
  for (const [beat, len, vel] of [[0, 1.4, 1], [1.5, 0.9, 0.8], [3, 0.6, 0.7]]) {
    c.ep.forEach((n, i) => ep(t0 + beat * BEAT + i * 0.006, n, len * BEAT, vel, (i - 1.5) * 0.25))
  }
  // 베이스
  bass(t0, c.root, BEAT * 1.4)
  bass(t0 + BEAT * 2.5, c.root, BEAT * 0.45, 0.8)
  bass(t0 + BEAT * 3, c.root + 12, BEAT * 0.8, 0.7)
  // 뜯는 소리 8분음표(위아래로)
  const pat = [0, 1, 2, 3, 2, 1, 2, 3]
  pat.forEach((k, i) => pluck(t0 + i * BEAT * 0.5, c.arp[k], i % 2 ? 0.6 : 0.85, i % 2 ? 0.35 : -0.35))
  // 북
  if (!calm) {
    kick(t0)
    kick(t0 + BEAT * 2)
    if (b % 4 === 3) kick(t0 + BEAT * 3.5, 0.7)
    clap(t0 + BEAT)
    clap(t0 + BEAT * 3)
  }
  for (let h = 0; h < 8; h++) hat(t0 + h * BEAT * 0.5, (h % 2 ? 0.55 : 0.9) * (calm ? 0.6 : 1))
}
// 끝: F → G → Cmaj9 로 마무리하고 울림을 남긴다
const end0 = GROOVE + bars * BAR
const cadence = [
  [end0, [57, 60, 64, 65], 29, BEAT * 2],
  [end0 + BEAT * 2, [59, 62, 65, 67], 31, BEAT * 2]
]
for (const [t, notes, root, len] of cadence) {
  notes.forEach((n, i) => ep(t + i * 0.008, n, len, 0.9))
  bass(t, root, len * 0.9)
}
const fin = end0 + BEAT * 4
;[60, 64, 67, 71, 74].forEach((n, i) => ep(fin + i * 0.03, n, 3.5, 0.95, (i - 2) * 0.2))
bass(fin, 36, 2.8)
pad(fin, [48, 55, 64, 71], Math.max(1, duration - fin + 0.3), 1)
pluck(fin + 0.4, 84, 0.8)
pluck(fin + 0.55, 88, 0.7)

// 음악 전체에 공간감(간단한 리버브: 빗살 4개 + 전대역 통과 2개)
function reverb(buf, mix) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, b: new Float32Array(d), i: 0, f: 0 }))
  const aps = [556, 441].map((d) => ({ d, b: new Float32Array(d), i: 0 }))
  for (const ch of buf) {
    for (const c of combs) c.b.fill(0)
    for (const a of aps) a.b.fill(0)
    for (let n = 0; n < N; n++) {
      const x = ch[n]
      let y = 0
      for (const c of combs) {
        const o = c.b[c.i]
        c.f = o * 0.8 + c.f * 0.2
        c.b[c.i] = x + c.f * 0.78
        c.i = (c.i + 1) % c.d
        y += o
      }
      for (const a of aps) {
        const o = a.b[a.i]
        const v = -y * 0.5 + o
        a.b[a.i] = y + o * 0.5
        a.i = (a.i + 1) % a.d
        y = v
      }
      ch[n] = x + y * mix * 0.25
    }
  }
}
reverb(music, 0.5)

// ── 효과음 ─────────────────────────────────────────────────
const fx = {
  key(t, g) {
    const bp = biquad('bp', 3800 + rand() * 600, 1.2)
    add(sfx, t, 0.06, (s) => bp(noise()) * Math.exp(-s * 90) * 1.6 + Math.sin(TAU * 170 * s) * Math.exp(-s * 70) * 0.5, 0.42 * g, 0.05)
  },
  type(t, g) {
    const bp = biquad('bp', 4800 + rand() * 900, 1.4)
    add(sfx, t, 0.04, (s) => bp(noise()) * Math.exp(-s * 140), 0.32 * g, 0.1)
  },
  click(t, g) {
    const bp = biquad('bp', 2600, 2)
    add(sfx, t, 0.03, (s) => bp(noise()) * Math.exp(-s * 220), 0.5 * g)
    add(sfx, t + 0.075, 0.03, (s) => bp(noise()) * Math.exp(-s * 260), 0.3 * g)
  },
  open(t, g) {
    const bp = biquad('bp', 1200, 0.8)
    add(sfx, t, 0.22, (s) => bp(noise()) * Math.sin(Math.PI * Math.min(1, s / 0.2)) * 0.8 + Math.sin(TAU * (660 + 500 * s) * s) * Math.exp(-s * 22) * 0.35, 0.35 * g)
  },
  swap(t, g) {
    add(sfx, t, 0.08, (s) => Math.sin(TAU * 1200 * s) * Math.exp(-s * 60), 0.12 * g)
  },
  window(t, g) {
    const lp = biquad('lp', 2200, 0.7)
    add(sfx, t, 0.3, (s) => lp(noise()) * Math.sin(Math.PI * Math.min(1, s / 0.28)), 0.22 * g, -0.1)
  },
  whoosh(t, g) {
    let f = 400
    add(sfx, t, 0.7, (s) => {
      f = 300 + 2400 * Math.sin(Math.PI * Math.min(1, s / 0.65))
      return biquadStep(f, noise()) * Math.sin(Math.PI * Math.min(1, s / 0.65))
    }, 0.32 * g)
  },
  ding(t, g) {
    for (const [n, d, a] of [[88, 0, 1], [95, 0.09, 0.8]]) {
      const f = midi(n)
      add(sfx, t + d, 1.2, (s) => (Math.sin(TAU * f * s) + 0.25 * Math.sin(TAU * f * 2.76 * s) * Math.exp(-s * 6)) * Math.exp(-s * 4.5), 0.13 * g * a)
    }
  },
  hop(t, g) {
    add(sfx, t, 0.22, (s) => Math.sin(TAU * (380 + 900 * s - 1200 * s * s) * s) * Math.exp(-s * 12) * Math.min(1, s / 0.004), 0.2 * g)
  },
  bubble(t, g) {
    add(sfx, t, 0.12, (s) => Math.sin(TAU * (720 + 1800 * s) * s) * Math.exp(-s * 30), 0.2 * g, 0.15)
  },
  paste(t, g) {
    add(sfx, t, 0.09, (s) => Math.sin(TAU * 240 * s) * Math.exp(-s * 45) + 0.4 * noise() * Math.exp(-s * 120), 0.3 * g)
  },
  send(t, g) {
    const bp = biquad('bp', 2000, 0.8)
    add(sfx, t, 0.25, (s) => bp(noise()) * Math.sin(Math.PI * Math.min(1, s / 0.22)) + Math.sin(TAU * (500 + 1400 * s) * s) * Math.exp(-s * 18) * 0.3, 0.3 * g)
  },
  tick(t, g) {
    add(sfx, t, 0.03, (s) => Math.sin(TAU * 2400 * s) * Math.exp(-s * 160), 0.08 * g)
  },
  card(t, g) {
    const bp = biquad('bp', 1800, 0.9)
    add(sfx, t, 0.2, (s) => bp(noise()) * Math.sin(Math.PI * Math.min(1, s / 0.18)) + Math.sin(TAU * 990 * s) * Math.exp(-s * 25) * 0.25, 0.28 * g, 0.4)
  },
  down(t, g) {
    add(sfx, t, 0.4, (s) => biquadStep(2600 - 2200 * s, noise()) * Math.sin(Math.PI * Math.min(1, s / 0.38)), 0.32 * g)
  },
  up(t, g) {
    add(sfx, t, 0.4, (s) => biquadStep(400 + 2200 * s, noise()) * Math.sin(Math.PI * Math.min(1, s / 0.38)), 0.32 * g)
  }
}
// 주파수가 움직이는 대역 통과(효과음 쓸림 소리)
let bq = { x1: 0, x2: 0, y1: 0, y2: 0 }
function biquadStep(f, x) {
  const w = (TAU * Math.max(80, f)) / SR
  const alpha = Math.sin(w) / 2
  const a0 = 1 + alpha
  const y = (alpha * x - alpha * bq.x2 + 2 * Math.cos(w) * bq.y1 - (1 - alpha) * bq.y2) / a0
  bq = { x1: x, x2: bq.x1, y1: y, y2: bq.y1 }
  return y
}
for (const c of cues) {
  bq = { x1: 0, x2: 0, y1: 0, y2: 0 }
  if (fx[c.type]) fx[c.type](c.t, c.gain ?? 1)
}

// ── 섞기: 효과음이 날 때 음악을 조금 낮추고, 끝에서 서서히 줄인다 ─────────────
const duck = new Float32Array(N).fill(1)
for (const c of cues) {
  const s0 = Math.round(c.t * SR)
  for (let i = -2400; i < 9600; i++) {
    const k = s0 + i
    if (k < 0 || k >= N) continue
    const d = i < 0 ? 1 + (0.25 * i) / 2400 : 0.75 + (0.25 * i) / 9600
    duck[k] = Math.min(duck[k], Math.max(0.75, d))
  }
}
const out = [new Float32Array(N), new Float32Array(N)]
const fadeStart = (duration - 1.6) * SR
for (let ch = 0; ch < 2; ch++) {
  for (let n = 0; n < N; n++) {
    const fade = n < fadeStart ? 1 : Math.max(0, 1 - (n - fadeStart) / (1.6 * SR))
    const fadeIn = Math.min(1, n / (0.05 * SR))
    out[ch][n] = (music[ch][n] * 0.9 * duck[n] + sfx[ch][n]) * fade * fadeIn
  }
}
// 직류 성분을 걸러 낸다(20 Hz 아래)
for (const ch of out) {
  const r = 1 - (TAU * 20) / SR
  let px = 0, py = 0
  for (let n = 0; n < N; n++) {
    const y = ch[n] - px + r * py
    px = ch[n]
    py = y
    ch[n] = y
  }
}
// 최고점 -1 dBFS로 맞추고 부드럽게 눌러 준다
let peak = 0
for (const ch of out) for (const v of ch) peak = Math.max(peak, Math.abs(v))
const g = 0.89 / Math.max(peak, 1e-6)
const len = Math.round(duration * SR)
const pcm = Buffer.alloc(44 + len * 4)
pcm.write('RIFF', 0)
pcm.writeUInt32LE(36 + len * 4, 4)
pcm.write('WAVEfmt ', 8)
pcm.writeUInt32LE(16, 16)
pcm.writeUInt16LE(1, 20)
pcm.writeUInt16LE(2, 22)
pcm.writeUInt32LE(SR, 24)
pcm.writeUInt32LE(SR * 4, 28)
pcm.writeUInt16LE(4, 32)
pcm.writeUInt16LE(16, 34)
pcm.write('data', 36)
pcm.writeUInt32LE(len * 4, 40)
for (let n = 0; n < len; n++) {
  for (let ch = 0; ch < 2; ch++) {
    const v = Math.tanh(out[ch][n] * g * 1.15) / Math.tanh(1.15)
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + n * 4 + ch * 2)
  }
}
writeFileSync(join(CACHE, 'audio.wav'), pcm)
console.log(`audio: ${duration.toFixed(1)}s, ${cues.length} cues → ${join(CACHE, 'audio.wav')}`)
