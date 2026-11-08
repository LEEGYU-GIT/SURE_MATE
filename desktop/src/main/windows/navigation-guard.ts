/** webContents 중 이동을 막는 데 쓰는 부분(시험에서 흉내 내기 쉽게 Electron 타입 대신) */
export interface NavigableContents {
  on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): unknown
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
}

/**
 * 창이 다른 주소로 이동하거나 새 창을 열지 못하게 한다. Sure-Mate 창은 한 페이지 앱이라 이동할 일이 없다.
 * 파일을 끌어다 놓으면 Chromium이 그 파일(file://)로 이동해 팔레트가 사라지고 IPC가 그 페이지에 열린다.
 */
export function lockNavigation(wc: NavigableContents): void {
  wc.on('will-navigate', (event) => event.preventDefault())
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
}
