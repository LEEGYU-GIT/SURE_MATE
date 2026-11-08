/**
 * 파일을 끌어다 놓으면 브라우저 기본 동작으로 그 파일을 열어 팔레트가 사라진다. dragover까지 막아야
 * 놓을 수 없다는 커서가 보인다. (main에서도 이동을 막는다: navigation-guard)
 */
export function preventFileDrop(target: Pick<EventTarget, 'addEventListener'>): void {
  for (const type of ['dragover', 'drop']) target.addEventListener(type, (e) => e.preventDefault())
}
