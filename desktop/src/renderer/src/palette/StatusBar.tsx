import { useEffect, useState } from 'react'
import type { AppStatus } from '../../../shared/ipc-channels'
import { maskingModeLabel } from '../../../shared/labels'

/** 팔레트 아래쪽 한 줄: 가명 처리 모드(끔이면 주황)와 팔레트 단축키 */
export function StatusBar({ refreshKey }: { refreshKey: number }): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus | null>(null)

  useEffect(() => {
    void window.sureMate.getStatus().then(setStatus)
  }, [refreshKey])

  if (!status) return <div className="h-8 shrink-0 border-t border-white/10" />
  const off = status.maskingMode === 'off'
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-white/10 px-4 text-xs text-zinc-400">
      <span className={off ? 'font-medium text-orange-400' : undefined}>가명 처리: {maskingModeLabel(status.maskingMode)}</span>
      <span>팔레트 {status.paletteHotkey}</span>
    </div>
  )
}
