// Scenario data for the promo video, computed with the app's own code (palette items, prompt filling, masking, unmasking,
// mate bubble text) so every Sure-Mate screen in the video shows what the app really does with this (fictional) input.
// Run through build.mjs (needs: node --experimental-transform-types --import ./lib/register-ts.mjs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DESKTOP = join(HERE, '../../../desktop')
const app = (path) => import(join(DESKTOP, path))
const json = (path) => JSON.parse(readFileSync(join(DESKTOP, path), 'utf8'))

const { appCommandItems } = await app('src/main/apps/app-commands.ts')
const { buildPaletteItems } = await app('src/main/prompts/palette-items.ts')
const { workspacePaletteItems } = await app('src/main/workspace/workspace-items.ts')
const { parseTemplatePack } = await app('src/shared/template/pack.ts')
const { fillTemplate } = await app('src/shared/template/fill.ts')
const { parseGlossaryPack } = await app('src/shared/glossary/pack.ts')
const { termsFor } = await app('src/shared/glossary/find-terms.ts')
const { createMaskingService } = await app('src/main/masking/masking-service.ts')
const { DEFAULT_SETTINGS } = await app('src/shared/settings/settings.ts')
const { ALL_CATEGORIES } = await app('src/shared/masking/types.ts')
const { allAiTargets } = await app('src/shared/ai-targets.ts')
const { petBubbleText, PET_NUDGE_LINES } = await app('src/shared/pet/pet-copy.ts')
const { testWorkspace } = await app('src/shared/workspace/test-workspaces.ts')
const { L, P } = await app('src/shared/workspace/test-monitors.ts')
const { monitorFingerprint } = await app('src/shared/workspace/monitors.ts')
const { withHideWorkspace } = await app('src/shared/workspace/builtin.ts')

// ── fictional people, clients, and documents (no real names) ────────────────────────────────

/** 가명 사전: the demo PC's masking dictionary */
const DICTIONARY = [
  { id: 'demo-client-1', category: 'client', canonical: '가상자동차', aliases: ['가상차'] },
  { id: 'demo-client-2', category: 'client', canonical: 'XY방산', aliases: [] },
  { id: 'demo-person-1', category: 'person', canonical: '김가상', aliases: [] },
  { id: 'demo-person-2', category: 'person', canonical: '이예시', aliases: [] }
]

/** 10:30 meeting memo (selected in the memo window, then '회의록 정리') */
const MEMO = [
  '가상자동차 BCM 주간 회의 (11/16)',
  '- 참석: 김가상, 이예시',
  '- 브레이크 제어기 MC/DC 92% → 금요일까지 100%로 올리기로 함',
  '- HIL 장비 2번 고장, 이예시가 수리 요청',
  '- 시험 결과는 10.0.3.15 서버 C:\\가상자동차\\시험결과 폴더에 올림',
  '- 할 일: 정적분석 위반 소명 초안(김가상), 시험 일정 공유(이예시)'
].join('\n')

/** The AI's reply to the masked prompt (what a chat AI would write; tokens kept as the preamble asks) */
const AI_ANSWER = [
  '### 1. 회의 개요',
  '- 주제: CLIENT_A BCM 주간 회의 (11/16)',
  '- 참석자: PERSON_A, PERSON_B',
  '',
  '### 2. 결정 사항',
  '1. 브레이크 제어기 MC/DC를 금요일까지 100%로 올림(현재 92%)',
  '',
  '### 3. 할 일 표',
  '| 할 일 | 담당자 | 기한 | 비고 |',
  '|---|---|---|---|',
  '| 정적분석 위반 소명 초안 | PERSON_A | 모름 | |',
  '| 시험 일정 공유 | PERSON_B | 모름 | |',
  '| HIL 장비 2번 수리 요청 | PERSON_B | 모름 | 진행 중 |',
  '',
  '### 4. 미결 사항',
  '- 시험 결과 위치: IP_1 서버 PATH_1 [확인 필요]'
].join('\n')

/** Custom AI target added in settings (a generic chat site, so the video does not imitate a real AI product's page) */
const AI_TARGET = { id: 'demo-ai', name: 'AI 채팅', url: 'https://ai.example.com' }

/** Typing as a Korean IME shows it (jamo, then the composed syllable) */
const TYPING = {
  ttree: ['ㅊ', '추', '출', '출ㄱ', '출그', '출근'],
  meeting: ['ㅎ', '회', '회ㅇ', '회의', '회의ㄹ', '회의로', '회의록'],
  unmask: ['ㄱ', '가', '감', '가며', '가명', '가명 ㄷ', '가명 되', '가명 되돌', '가명 되돌려', '가명 되돌려줘'],
  snippet: ['!', '!ㅇ', '!이', '!잇', '!이슈']
}

// ── palette items: the same builder as the app (prompts, commands, workspaces, glossary, installed apps) ──────

const templates = parseTemplatePack(json('resources/prompts.json'), 'builtin').templates
const glossary = parseGlossaryPack(json('resources/glossary.json'), 'builtin').entries
const fingerprint = monitorFingerprint([P, L])
const workspaces = withHideWorkspace(
  [
    testWorkspace({ id: 'ws-work', name: '업무 배치', aliases: ['업무', '출근 세팅'], hotkey: 'Ctrl+Alt+1' }),
    testWorkspace({ id: 'ws-report', name: '보고서 모드', aliases: ['보고'], hotkey: 'Ctrl+Alt+2' })
  ],
  { now: new Date('2026-11-16T09:00:00+09:00'), hotkey: 'Ctrl+Alt+H' }
).list
const items = buildPaletteItems(templates, [], {
  maskingMode: 'restore',
  glossary,
  barShape: 'edge',
  petVisible: true,
  petSleeping: false,
  workspaces: workspacePaletteItems(workspaces, fingerprint),
  apps: appCommandItems(['messenger', 'ttree'])
})

const NOW = Date.parse('2026-11-16T09:00:00+09:00')
const used = (minutesAgo, count) => ({ count, lastAt: new Date(NOW - minutesAgo * 60_000).toISOString() })
const usage = [
  ['prompt:meeting-notes', used(60 * 17, 14)],
  ['workspace:ws-work', used(60 * 18, 9)],
  ['cmd.unmask', used(60 * 17 - 5, 6)],
  ['wiki:mcdc', used(60 * 20, 3)],
  ['snippet:defect-report', used(60 * 26, 4)]
]

// ── 10:30 meeting notes: fill the real template, mask with the real service (preview = dry run, then the real run) ──

const template = templates.find((t) => t.id === 'meeting-notes')
const filled = fillTemplate(template.body, {
  input: MEMO,
  clipboard: '',
  now: new Date('2026-11-16T10:30:00+09:00'),
  terms: (text) => termsFor(text, glossary),
  reference: () => null
})
const masking = createMaskingService({
  loadDictionary: async () => ({ terms: DICTIONARY, errors: 0 }),
  settings: () => DEFAULT_SETTINGS.masking,
  now: () => 0
})
const dry = await masking.mask(filled.text, { mode: 'restore', disabledKeys: [], dryRun: true })
const PREVIEW_CHARS = 4000
const clip = (ranges) => ranges.filter(([s]) => s < PREVIEW_CHARS).map(([s, e]) => [s, Math.min(e, PREVIEW_CHARS)])
const preview = {
  text: dry.text.slice(0, PREVIEW_CHARS),
  truncated: dry.text.length > PREVIEW_CHARS,
  inputLength: MEMO.length,
  warnings: [...filled.warnings, ...dry.warnings],
  notes: [...filled.notes, ...dry.notes],
  highlights: clip(dry.mapRanges(filled.inputRanges)),
  masking: { mode: 'restore', items: dry.items },
  maskRanges: clip(dry.ranges)
}
const run = await masking.mask(filled.text, { mode: 'restore', disabledKeys: [], dryRun: false })
const masked = ALL_CATEGORIES.map((category) => ({
  category,
  count: run.items.filter((i) => i.enabled && i.category === category).reduce((n, i) => n + i.count, 0)
})).filter((m) => m.count > 0)
const restored = masking.unmask(AI_ANSWER)

const targets = allAiTargets([AI_TARGET])
const fixtures = {
  generatedFrom: 'docs/promo/video/fixtures.mjs',
  palette: {
    items,
    usage,
    status: { paletteHotkey: 'Ctrl+Alt+Space', maskingMode: 'restore', aiTargetName: AI_TARGET.name },
    typing: TYPING
  },
  confirm: {
    draft: {
      templateId: template.id,
      name: template.name,
      group: template.group,
      selection: { length: MEMO.length },
      clipboardLength: 0,
      defaultSource: 'selection',
      targets: targets.map((t) => ({ id: t.id, name: t.name })),
      target: AI_TARGET.id,
      masking: 'restore',
      maskingTip: false
    },
    preview
  },
  memo: MEMO,
  prompt: run.text,
  maskedItems: run.items.map((i) => ({ category: i.category, original: i.original, replacement: i.replacement })),
  aiAnswer: AI_ANSWER,
  restoredAnswer: restored.text,
  restoredCount: restored.restored,
  aiTarget: AI_TARGET,
  bubbles: {
    copied: petBubbleText({ type: 'prompt-copied', masking: 'restore', masked, target: AI_TARGET.name }),
    unmasked: petBubbleText({ type: 'unmasked', restored: restored.restored }),
    nudge: PET_NUDGE_LINES[0]
  },
  snippet: templates.find((t) => t.id === 'defect-report').body,
  apps: appCommandItems(['messenger', 'ttree'])
}

mkdirSync(join(HERE, '.cache'), { recursive: true })
writeFileSync(join(HERE, '.cache/fixtures.json'), JSON.stringify(fixtures, null, 2))
console.log(
  `fixtures: ${items.length} palette items, ${run.items.length} masked names (${masked.map((m) => `${m.category} ${m.count}`).join(', ')}), ${restored.restored} restored`
)
