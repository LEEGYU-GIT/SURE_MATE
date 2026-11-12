import { defineConfig } from 'vitest/config'

/**
 * 속도 시험(이름이 '속도'로 시작)은 다른 시험이 모두 끝난 뒤 따로 잰다. 전체 시험을 함께 돌리면 다른 시험 파일이 CPU를 나눠 써서
 * 같은 계산이 2~3배 느리게 재진다(2026-11-12 회사 PC: 200자 문장 검색이 혼자 약 21ms, 함께 53~97ms).
 * 속도 시험을 다른 파일에 더하면 speed의 include에도 그 파일을 더한다.
 */
const SPEED = /^속도/
const NOT_SPEED = /^(?!속도)/

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'], testNamePattern: NOT_SPEED } },
      {
        test: {
          name: 'speed',
          environment: 'node',
          include: ['src/main/prompts/natural-search.test.ts'],
          testNamePattern: SPEED,
          sequence: { groupOrder: 1 }
        }
      }
    ]
  }
})
