import type { PaletteGroup, PaletteItem } from '../../../shared/types'

/** 구역 순서와 이름 */
export const GROUPS: { id: PaletteGroup; label: string }[] = [
  { id: 'prompt', label: '프롬프트' },
  { id: 'command', label: '명령' },
  { id: 'workspace', label: '워크스페이스' },
  { id: 'snippet', label: '상용구' },
  { id: 'wiki', label: '위키' }
]

/** M1 가짜 데이터. 개발 명령 id는 main의 dev-commands와 맞춘다. */
export const MOCK_ITEMS: PaletteItem[] = [
  { id: 'prompt.meeting', group: 'prompt', title: '회의록 정리', subtitle: '결정 사항·담당자·후속 업무 표', keywords: ['회의', '미팅'] },
  { id: 'prompt.testcase', group: 'prompt', title: '요구사항 → 테스트 케이스', subtitle: '정상·경계·예외', keywords: ['테스트', 'tc'] },
  { id: 'dev.imeLogger', group: 'command', title: '개발: 한글 입력 기록기', keywords: ['ime', 'dev'] },
  { id: 'dev.listWindows', group: 'command', title: '개발: 창 목록', keywords: ['window', 'dev'] },
  { id: 'dev.moveToOtherMonitor', group: 'command', title: '개발: 직전 창을 다른 모니터 왼쪽 절반으로', keywords: ['monitor', 'dev'] },
  { id: 'dev.pasteTest', group: 'command', title: '개발: 붙여넣기 시험', keywords: ['paste', 'dev'] },
  { id: 'dev.clipboardExcludeTest', group: 'command', title: '개발: 클립보드 기록 제외 시험', keywords: ['clipboard', 'dev'] },
  { id: 'workspace.qa', group: 'workspace', title: 'QA 모드', keywords: ['qa', '시험'] },
  { id: 'workspace.report', group: 'workspace', title: '보고서 모드', keywords: ['보고서'] },
  { id: 'snippet.issue', group: 'snippet', title: '결함 리포트', subtitle: '!이슈', keywords: ['이슈', '버그'] },
  { id: 'wiki.mcdc', group: 'wiki', title: 'MC/DC', subtitle: '변경 조건/결정 커버리지', keywords: ['mcdc', '커버리지'] },
  { id: 'wiki.static', group: 'wiki', title: '정적분석', subtitle: '코드를 실행하지 않고 결함을 찾는 분석', keywords: ['static'] }
]
