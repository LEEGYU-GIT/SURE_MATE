// One command for the whole promo video: scenario data → real UI captures → frames → audio → MP4.
//   node docs/promo/video/build.mjs                 (저장소 어디서나, Node 22 이상)
//   node docs/promo/video/build.mjs --skip-capture  (캡처는 그대로 두고 장면·소리만 다시)
// 결과: docs/promo/video/out/sure-mate-promo.mp4, out/sure-mate-promo-poster.png
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, '.cache')
const OUT = join(HERE, 'out')
const args = process.argv.slice(2)
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'
// 앱의 TypeScript 소스를 그대로 불러온다(Node 22: 형식만 지우고 실행, 확장자 없는 import는 lib/ts-hook.mjs가 채운다)
const TS = ['--experimental-transform-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', '--import', './lib/register-ts.mjs']
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '' }
const run = (label, cmd, argv) => {
  const started = Date.now()
  console.log(`\n▶ ${label}`)
  execFileSync(cmd, argv, { cwd: HERE, stdio: 'inherit', env })
  console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}초`)
}

if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 이상으로 실행해 주세요.')
mkdirSync(OUT, { recursive: true })
run('시나리오 데이터(앱 코드로 팔레트 항목·가명 처리·말풍선 문구 계산)', process.execPath, [...TS, 'fixtures.mjs'])
if (!args.includes('--skip-capture')) run('실제 화면 캡처(미리 보기 빌드 → 투명 PNG)', process.execPath, [...TS, 'capture.mjs', '--build'])
run('프레임 렌더링', process.execPath, ['render.mjs', ...args.filter((a) => a.startsWith('--fps='))])
run('음악·효과음 합성', process.execPath, ['audio.mjs'])
const mp4 = join(OUT, 'sure-mate-promo.mp4')
run('영상과 소리 합치기', ffmpeg, ['-y', '-loglevel', 'error', '-i', join(CACHE, 'video.mp4'), '-i', join(CACHE, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4])
run('대표 이미지', ffmpeg, ['-y', '-loglevel', 'error', '-ss', '24.5', '-i', mp4, '-frames:v', '1', join(OUT, 'sure-mate-promo-poster.png')])
console.log(`\n완료: ${mp4} (${(statSync(mp4).size / 1048576).toFixed(1)} MB)`)
