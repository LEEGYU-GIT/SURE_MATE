import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { STYLE_LIMITS } from '../../shared/style/style-card'
import type { Template } from '../../shared/template/types'
import {
  addStyleSample,
  listStyleKinds,
  readStyleSamples,
  removeStyleSample,
  STYLE_DIR,
  styleKindOfBody
} from './style-store'

let dir: string
const NOW = new Date('2026-11-16T05:00:00.000Z')
const SAMPLE = '- HIL 2번 장비 수리 요청함\n- 결과 공유 예정'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sure-mate-style-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const tpl = (id: string, name: string, body: string): Template =>
  ({ id, name, kind: 'prompt', body, aliases: [], scope: 'builtin' }) as Template

it('견본을 더하면 style/<종류>.json에 쓰고, 읽으면 넣은 순서대로 나온다', async () => {
  expect(await addStyleSample(dir, '회의록', `  ${SAMPLE}\r\n`, NOW)).toEqual({
    ok: true,
    count: 1,
    dropped: false
  })
  expect(await addStyleSample(dir, '회의록', '- 장비 수리 완료됨\n- 재시험 필요함', NOW)).toEqual({
    ok: true,
    count: 2,
    dropped: false
  })
  expect(readStyleSamples(dir, '회의록').map((s) => s.text)).toEqual([
    SAMPLE,
    '- 장비 수리 완료됨\n- 재시험 필요함'
  ])
  const file = JSON.parse(await readFile(join(dir, STYLE_DIR, '회의록.json'), 'utf8'))
  expect(file).toMatchObject({
    format: 'sure-mate-style',
    version: 1,
    samples: [{ addedAt: NOW.toISOString() }, {}]
  })
})

it('너무 짧거나 긴 글, 같은 글, 경로 문자가 든 종류 이름은 받지 않는다', async () => {
  expect(await addStyleSample(dir, '회의록', '짧음', NOW)).toMatchObject({ ok: false })
  expect(
    await addStyleSample(dir, '회의록', 'ㄱ'.repeat(STYLE_LIMITS.maxChars + 1), NOW)
  ).toMatchObject({ ok: false })
  await addStyleSample(dir, '회의록', SAMPLE, NOW)
  expect(await addStyleSample(dir, '회의록', SAMPLE, NOW)).toEqual({
    ok: false,
    reason: '이미 넣은 견본이에요'
  })
  expect(await addStyleSample(dir, '../밖', SAMPLE, NOW)).toMatchObject({ ok: false })
  expect(readStyleSamples(dir, '../밖')).toEqual([])
})

it(`${STYLE_LIMITS.samples}개가 넘으면 가장 오래된 견본을 뺀다`, async () => {
  for (let i = 0; i < STYLE_LIMITS.samples; i++)
    await addStyleSample(dir, '메일', `${SAMPLE} ${i}번째`, NOW)
  expect(await addStyleSample(dir, '메일', `${SAMPLE} 마지막`, NOW)).toEqual({
    ok: true,
    count: STYLE_LIMITS.samples,
    dropped: true
  })
  const texts = readStyleSamples(dir, '메일').map((s) => s.text)
  expect(texts[0]).toBe(`${SAMPLE} 1번째`)
  expect(texts.at(-1)).toBe(`${SAMPLE} 마지막`)
})

it('깨진 파일은 빈 목록으로 읽고, 더할 때 고장 사본을 남긴 뒤 새로 쓴다', async () => {
  await mkdir(join(dir, STYLE_DIR))
  await writeFile(join(dir, STYLE_DIR, '회의록.json'), '{ 깨짐')
  expect(readStyleSamples(dir, '회의록')).toEqual([])
  expect(await addStyleSample(dir, '회의록', SAMPLE, NOW)).toMatchObject({ ok: true, count: 1 })
  const files = await readdir(join(dir, STYLE_DIR))
  expect(files.some((f) => f.startsWith('회의록.json.broken-'))).toBe(true)
})

it('removeStyleSample: index번째를 지운다(범위 밖은 실패)', async () => {
  await addStyleSample(dir, '회의록', SAMPLE, NOW)
  await addStyleSample(dir, '회의록', `${SAMPLE} 둘째`, NOW)
  expect(await removeStyleSample(dir, '회의록', 0)).toEqual({ ok: true })
  expect(readStyleSamples(dir, '회의록').map((s) => s.text)).toEqual([`${SAMPLE} 둘째`])
  expect(await removeStyleSample(dir, '회의록', 5)).toEqual({ ok: false })
  expect(await removeStyleSample(dir, '회의록', -1)).toEqual({ ok: false })
})

it('listStyleKinds: 템플릿이 쓰는 종류와 견본 파일만 있는 종류, 이름 순', async () => {
  await addStyleSample(dir, '보고서', SAMPLE, NOW)
  const list = listStyleKinds(
    [
      tpl('meeting-notes', '회의록 정리', '{{style:회의록}}\n{{selection}}'),
      tpl('mail', '메일 회신', '{{ style:메일 }} {{selection}}'),
      tpl('bad', '이상한', '{{style:../x}}')
    ],
    dir
  )
  expect(list).toEqual([
    { kind: '메일', samples: 0, usedBy: ['메일 회신'] },
    { kind: '보고서', samples: 1, usedBy: [] },
    { kind: '회의록', samples: 0, usedBy: ['회의록 정리'] }
  ])
})

it('styleKindOfBody: 본문의 첫 말투 종류', () => {
  expect(styleKindOfBody('[할 일]\n{{style:회의록}}\n{{style:메일}}')).toBe('회의록')
  expect(styleKindOfBody('{{selection}}')).toBeNull()
})
