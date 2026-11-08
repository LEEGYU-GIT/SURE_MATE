import { expect, it } from 'vitest'
import { createExclusive } from './exclusive'

it('실행 중에 또 부르면 실행하지 않고 busy 값을 돌려준다', async () => {
  const run = createExclusive()
  let release!: () => void
  const first = run(
    () =>
      new Promise<string>((resolve) => {
        release = () => resolve('첫 번째')
      }),
    () => 'busy'
  )
  expect(await run(async () => '두 번째', () => 'busy')).toBe('busy')
  release()
  expect(await first).toBe('첫 번째')
  expect(await run(async () => '세 번째', () => 'busy')).toBe('세 번째')
})

it('작업이 실패해도 잠금이 풀린다', async () => {
  const run = createExclusive()
  await expect(
    run(async () => {
      throw new Error('실패')
    }, () => 'busy')
  ).rejects.toThrow('실패')
  expect(await run(async () => 'ok', () => 'busy')).toBe('ok')
})
