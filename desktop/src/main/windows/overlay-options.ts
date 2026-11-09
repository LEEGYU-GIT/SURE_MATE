import type { BrowserWindowConstructorOptions } from 'electron'

/**
 * 바·펼침 창 옵션(설계 문서 §14-1·§9): 포커스를 받지 않는 투명 도구 창.
 * backgroundThrottling false: 숨긴 펼침 창도 내용을 그리고 크기를 재야 한다.
 * thickFrame false: 크기 조절 테두리를 빼 Windows가 최소 창 너비를 강제하지 않게(너비 44·56, 손잡이 6) 하고 표시 애니메이션을 없앤다.
 * roundedCorners false: Windows 11이 테두리 없는 창 모서리를 둥글게 잘라 CSS 모양을 가리지 않게 한다.
 */
export function overlayWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    show: false,
    frame: false,
    transparent: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    type: 'toolbar',
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  }
}
