import { BAR_LIMITS, type BarEdge, type BarShape } from '../../../shared/bar/bar-settings'
import { Button, RadioList, Row, Section, Segmented, Slider, Toggle } from './controls'
import { pinnedPromptsReducer, PINNED_MAX, type PinnedAction } from './pinned-prompts'
import { useSettingsCtx } from './use-settings'

const SHAPES: { value: BarShape; label: string }[] = [
  { value: 'edge', label: '가장자리 띠' },
  { value: 'capsule', label: '떠 있는 캡슐' },
  { value: 'off', label: '끄기' }
]
const EDGES: { value: BarEdge; label: string }[] = [
  { value: 'right', label: '오른쪽' },
  { value: 'left', label: '왼쪽' }
]

/** 바(설계 문서 §14-1): 모양·가장자리·모니터, 고정 프롬프트(5개까지·순서), 자동 숨김·불투명도, 위키 카드 */
export function BarTab(): React.JSX.Element {
  const { snapshot, save, revision } = useSettingsCtx()
  const bar = snapshot.settings.bar
  const names = new Map(snapshot.prompts.map((p) => [p.id, p.name]))
  const pin = (a: PinnedAction): void => {
    const next = pinnedPromptsReducer(bar.pinnedPrompts, a)
    if (next !== bar.pinnedPrompts) void save({ bar: { pinnedPrompts: next } })
  }
  const monitors = [
    { value: 'primary', label: '주 모니터', description: '모니터를 연결·해제해도 늘 주 모니터에 둬요' },
    ...snapshot.displays.filter((d) => !d.primary).map((d) => ({ value: d.id, label: d.label }))
  ]
  const unpinned = snapshot.prompts.filter((p) => !bar.pinnedPrompts.includes(p.id))
  return (
    <>
      <Section title="모양과 자리">
        <Row label="바 모양" description="가장자리 띠는 화면 끝에 붙고, 캡슐은 끝에서 조금 떨어져 떠 있어요. 끄면 트레이·팔레트에서 다시 켜요">
          {(ids) => <Segmented {...ids} value={bar.shape} options={SHAPES} onChange={(shape) => void save({ bar: { shape } })} />}
        </Row>
        <Row label="붙일 가장자리">
          {(ids) => <Segmented {...ids} value={bar.edge} options={EDGES} onChange={(edge) => void save({ bar: { edge } })} />}
        </Row>
        {monitors.length > 1 ? (
          <Row label="모니터" stack>
            {(ids) => <RadioList {...ids} value={bar.monitor} options={monitors} onChange={(monitor) => void save({ bar: { monitor } })} />}
          </Row>
        ) : null}
        <Row label="세로 위치" description="바의 빈 곳을 끌어 옮겨요. 모니터마다 마지막 자리를 기억해요">
          {() => null}
        </Row>
      </Section>

      <Section title={`고정 프롬프트 (${bar.pinnedPrompts.length}/${PINNED_MAX})`}>
        {bar.pinnedPrompts.length === 0 ? <p className="px-4 py-3 text-small leading-5 text-fg-2">바에 고정한 프롬프트가 없어요. 아래에서 고르세요.</p> : null}
        {bar.pinnedPrompts.map((id, i) => {
          const name = names.get(id)
          return (
            <Row key={id} label={name ?? '(없는 프롬프트)'} description={name ? undefined : '지워졌거나 이름이 바뀐 프롬프트예요. 빼 주세요'}>
              {() => (
                <div className="flex gap-2">
                  <Button label={`${name ?? id} 위로`} disabled={i === 0} onClick={() => pin({ type: 'move', id, by: -1 })}>
                    ↑
                  </Button>
                  <Button label={`${name ?? id} 아래로`} disabled={i === bar.pinnedPrompts.length - 1} onClick={() => pin({ type: 'move', id, by: 1 })}>
                    ↓
                  </Button>
                  <Button kind="danger" label={`${name ?? id} 빼기`} onClick={() => pin({ type: 'remove', id })}>
                    빼기
                  </Button>
                </div>
              )}
            </Row>
          )
        })}
        {unpinned.length > 0 && bar.pinnedPrompts.length < PINNED_MAX ? (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            {unpinned.map((p) => (
              <Button key={p.id} label={`${p.name} 고정하기`} onClick={() => pin({ type: 'add', id: p.id })}>
                + {p.name}
              </Button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="동작">
        <Row label="자동 숨김" description="바를 떠나고 1초 뒤 화면 끝 손잡이로 들어가요. 손잡이에 마우스를 올리면 다시 나와요">
          {(ids) => <Toggle {...ids} checked={bar.autoHide} onChange={(autoHide) => void save({ bar: { autoHide } })} />}
        </Row>
        <Row label="불투명도" description="바 바탕만 옅어지고 아이콘·상태 점은 그대로예요">
          {(ids) => (
            <Slider
              {...ids}
              resetKey={revision}
              value={Math.round(bar.opacity * 100)}
              min={Math.round(BAR_LIMITS.opacity.min * 100)}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              onCommit={(v) => void save({ bar: { opacity: v / 100 } })}
            />
          )}
        </Row>
      </Section>

      <Section title="위키 카드">
        <Row label="카드 너비">
          {(ids) => (
            <Slider
              {...ids}
              resetKey={revision}
              value={bar.wikiCardWidth}
              min={BAR_LIMITS.wikiCardWidth.min}
              max={BAR_LIMITS.wikiCardWidth.max}
              step={20}
              format={(v) => `${v}px`}
              onCommit={(wikiCardWidth) => void save({ bar: { wikiCardWidth } })}
            />
          )}
        </Row>
        <Row label="저절로 닫히기까지" description="카드에 마우스를 올려 두거나 고정하면 닫히지 않아요">
          {(ids) => (
            <Slider
              {...ids}
              resetKey={revision}
              value={Math.round(bar.wikiCardMs / 1000)}
              min={BAR_LIMITS.wikiCardMs.min / 1000}
              max={BAR_LIMITS.wikiCardMs.max / 1000}
              step={1}
              format={(v) => `${v}초`}
              onCommit={(v) => void save({ bar: { wikiCardMs: v * 1000 } })}
            />
          )}
        </Row>
      </Section>
    </>
  )
}
