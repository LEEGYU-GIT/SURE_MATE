/** 백신·검색 색인·동기화 프로그램이 파일을 잡고 있거나 쓸 수 없을 때 Windows가 내는 오류 코드 */
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * 용어를 저장하지 못했을 때 추가·수정 화면에 보일 문구(설계 문서 §9). 적은 글은 화면에 그대로 남는다.
 * 오류 원문에는 사용자 폴더 경로가 들어 있어 보이지 않고, 오류 코드(EPERM 등, 모르면 생략)로만 문구를 고른다.
 */
export function wikiSaveErrorText(code?: string): string {
  if (code && LOCKED.has(code)) return '용어 파일에 쓰지 못했어요. 백신이나 동기화 프로그램이 파일을 잠깐 잡고 있을 수 있어요. 잠시 뒤 Ctrl+↵로 다시 저장해 주세요'
  if (code === 'ENOSPC') return '디스크 공간이 모자라 저장하지 못했어요. 공간을 비운 뒤 Ctrl+↵로 다시 저장해 주세요'
  return '저장하지 못했어요. 잠시 뒤 Ctrl+↵로 다시 저장해 주세요'
}
