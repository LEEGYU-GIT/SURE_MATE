import { expect, it } from 'vitest'
import { overlayWindowOptions } from './overlay-options'

it('바·펼침 창은 포커스를 받지 않는 투명 도구 창이고 renderer는 격리된다', () => {
  const o = overlayWindowOptions('p')
  expect(o.webPreferences).toMatchObject({ preload: 'p', contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false })
  expect(o).toMatchObject({
    focusable: false,
    transparent: true,
    type: 'toolbar',
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    show: false
  })
})
