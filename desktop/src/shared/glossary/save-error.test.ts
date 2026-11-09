import { expect, it } from 'vitest'
import { wikiSaveErrorText } from './save-error'

it('용어 저장 실패 문구: 파일이 잡혀 있으면(EPERM·EBUSY·EACCES) 잠시 뒤 다시, 디스크가 차면 공간을, 나머지는 다시 저장하라고 알린다', () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    expect(wikiSaveErrorText(code)).toBe('용어 파일에 쓰지 못했어요. 백신이나 동기화 프로그램이 파일을 잠깐 잡고 있을 수 있어요. 잠시 뒤 Ctrl+↵로 다시 저장해 주세요')
  }
  expect(wikiSaveErrorText('ENOSPC')).toBe('디스크 공간이 모자라 저장하지 못했어요. 공간을 비운 뒤 Ctrl+↵로 다시 저장해 주세요')
  expect(wikiSaveErrorText()).toBe('저장하지 못했어요. 잠시 뒤 Ctrl+↵로 다시 저장해 주세요')
  expect(wikiSaveErrorText('TypeError')).toBe(wikiSaveErrorText())
})
