import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/** desktop 폴더 */
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path: string): string => readFileSync(root + path, 'utf8')

it('설치 파일에 들어가는 resources/licenses에 글꼴(OFL)·아이콘(Lucide ISC) 라이선스 전문이 있다', () => {
  // OFL은 글꼴을 나눠 줄 때마다 저작권 고지와 라이선스를 함께 넣어야 한다
  const ofl = read('resources/licenses/Pretendard-OFL.txt')
  expect(ofl).toContain('Copyright (c) 2021, Kil Hyung-jin')
  expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1')
  // ISC는 모든 사본에 저작권 고지와 허가 문구가 있어야 한다
  const lucide = read('resources/licenses/Lucide-LICENSE.txt')
  expect(lucide).toContain('Lucide Icons and Contributors')
  expect(lucide).toContain('copyright notice and this permission notice appear in all copies')
})

it('electron-builder 설정이 resources 폴더를 빼지 않는다', () => {
  const builder = read('electron-builder.yml')
  expect(builder).not.toMatch(/'!resources/)
  expect(builder).toMatch(/asarUnpack:\s*\n\s*- resources\/\*\*/)
})
