import { useState } from 'react'
import type { SettingsHotkeyId } from '../../../shared/settings/settings-snapshot'
import { Button, Section } from './controls'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useSettingsCtx } from './use-settings'

const ROWS: { id: SettingsHotkeyId; label: string; description: string }[] = [
  { id: 'palette', label: '팔레트 열기', description: '프롬프트·용어·상용구·명령을 찾는 팔레트를 열고 닫아요' },
  { id: 'lookup', label: '선택한 글로 용어 찾기', description: '고른 글에 나온 용어를 바 옆 위키 카드로 보여 줘요' }
]

/** 단축키(설계 문서 §6): 지금 조합과 등록 상태, 바꾸기(녹화), 경고·사용 중 안내 */
export function HotkeysTab(): React.JSX.Element {
  const { snapshot } = useSettingsCtx()
  const [recording, setRecording] = useState<SettingsHotkeyId | null>(null)
  const [notice, setNotice] = useState<{ id: SettingsHotkeyId; text: string; warn: boolean } | null>(null)
  return (
    <Section title="전역 단축키">
      {ROWS.map((row) => {
        const h = snapshot.hotkeys[row.id]
        const labelId = `hotkey-${row.id}-label`
        return (
          <div key={row.id} className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div id={labelId} className="text-body leading-5 text-fg">
                  {row.label}
                </div>
                <div className="mt-0.5 text-small leading-5 text-fg-2">{row.description}</div>
              </div>
              <kbd className="rounded-control border border-line bg-surface-inset px-2 py-1 font-ui text-small text-fg">{h.acc ?? '없음'}</kbd>
              <span className={`w-24 shrink-0 text-small ${h.registered ? 'text-fg-2' : 'text-warn'}`}>{h.registered ? '쓰는 중' : '등록 못 함'}</span>
              {recording === row.id ? null : (
                <Button
                  label={`${row.label} 단축키 바꾸기`}
                  onClick={() => {
                    setNotice(null)
                    setRecording(row.id)
                  }}
                >
                  바꾸기
                </Button>
              )}
            </div>
            {recording === row.id ? (
              <HotkeyRecorder
                id={row.id}
                labelledBy={labelId}
                onDone={(r) => {
                  setRecording(null)
                  if (r) setNotice({ id: row.id, text: r.warning ? `${r.acc}로 바꿨어요 · ${r.warning}` : `${r.acc}로 바꿨어요`, warn: Boolean(r.warning) })
                }}
              />
            ) : null}
            {notice?.id === row.id ? (
              <p role="status" className={`text-small ${notice.warn ? 'text-warn' : 'text-fg-2'}`}>
                {notice.text}
              </p>
            ) : null}
            {!h.registered && recording !== row.id ? (
              <p className="text-small text-warn">다른 앱이 이 조합을 쓰고 있어 등록하지 못했어요. 다른 조합으로 바꿔 주세요.</p>
            ) : null}
          </div>
        )
      })}
    </Section>
  )
}
