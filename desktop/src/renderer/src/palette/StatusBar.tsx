import { useEffect, useState } from 'react'
import type { AppStatus } from '../../../shared/ipc-channels'
import { maskingModeLabel } from '../../../shared/labels'
import { ShieldIcon } from '../design/icons'

/** 팔레트 아래쪽 한 줄: 가명 처리 모드(끔이면 주황 글자), 기본 AI 대상, 키 안내 */
export function StatusBar({ refreshKey, hint = '↵ 실행 · Esc 닫기' }: { refreshKey: number; hint?: string }): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus | null>(null)

  useEffect(() => {
    void window.sureMate.getStatus().then(setStatus)
  }, [refreshKey])

  if (!status) return <div className="h-9 shrink-0 border-t border-line" />
  const off = status.maskingMode === 'off'
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-t border-line px-4 text-caption text-fg-3">
      <span className={off ? 'flex items-center gap-1.5 font-semibold text-warn' : 'flex items-center gap-1.5'}>
        <ShieldIcon size={14} className={off ? 'text-warn' : 'text-brand'} />
        {off ? '가명 처리 끔' : `가명 처리: ${maskingModeLabel(status.maskingMode)}`}
      </span>
      <span>AI: {status.aiTargetName}</span>
      <span className="ml-auto">{hint}</span>
      <span className="text-fg-3/80">팔레트 {status.paletteHotkey ?? '단축키 없음'}</span>
    </div>
  )
}
