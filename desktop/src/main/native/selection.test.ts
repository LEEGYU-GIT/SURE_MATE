import { expect, it, vi } from 'vitest'

// Electron 45의 clipboard.writeText는 Promise를 돌려준다. 끝나기 전에 클립보드 줄을 풀면 안 된다.
const fake = vi.hoisted(() => ({ pending: [] as (() => void)[] }))
vi.mock('electron', () => ({
  clipboard: {
    writeText: vi.fn(() => new Promise<void>((resolve) => fake.pending.push(resolve))),
    write: vi.fn(async () => {}),
    read: vi.fn(async () => []),
    readText: vi.fn(async () => ''),
    clear: vi.fn()
  },
  ClipboardItem: class {}
}))

it('writeClipboardText는 클립보드 쓰기가 끝난 뒤에야 끝난다(줄이 먼저 풀려 다음 가져오기가 끼어들지 않게)', async () => {
  const { writeClipboardText } = await import('./selection')
  let done = false
  const write = writeClipboardText('최종 프롬프트', { excludeFromHistory: false }).then(() => {
    done = true
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(fake.pending).toHaveLength(1)
  expect(done).toBe(false)
  fake.pending[0]()
  await write
  expect(done).toBe(true)
})

it('readClipboardText는 클립보드 줄에 서서 앞 일이 끝난 뒤에 읽는다(가져오기가 잠깐 넣은 글을 보지 않게)', async () => {
  const { readClipboardText, writeClipboardText } = await import('./selection')
  const { clipboard } = await import('electron')
  const read = vi.mocked(clipboard.readText)
  read.mockClear()
  read.mockResolvedValueOnce('원래 클립보드 글')
  const pendingBefore = fake.pending.length
  const write = writeClipboardText('앞 일', { excludeFromHistory: false })
  const text = readClipboardText()
  await new Promise((resolve) => setTimeout(resolve, 20))
  // 앞 일(쓰기)이 끝나기 전에는 읽지 않는다
  expect(read).not.toHaveBeenCalled()
  fake.pending[pendingBefore]()
  await write
  expect(await text).toBe('원래 클립보드 글')
  expect(read).toHaveBeenCalledTimes(1)
})
