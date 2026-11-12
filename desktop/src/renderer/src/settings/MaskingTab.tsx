import { useState } from 'react'
import { maskingModeLabel, MASK_CATEGORY_LABELS } from '../../../shared/labels'
import { defaultRemoveLabel } from '../../../shared/masking/mask'
import { ENTITY_CATEGORIES, PATTERN_CATEGORIES, type MaskCategory } from '../../../shared/masking/types'
import { SETTINGS_LIMITS, SETTING_MASKING_MODES } from '../../../shared/settings/settings'
import type { MaskingMode } from '../../../shared/types'
import { MASKING_EXPLAIN } from '../flyout/menu-model'
import { Button, RadioList, Row, Section, Slider, TextField, Toggle } from './controls'
import { DictionaryEditor } from './DictionaryEditor'
import { parseDomainsInput } from './domains'
import { MaskingExample } from './MaskingExample'
import { useSettingsCtx } from './use-settings'

const CATEGORY_HINTS: Record<MaskCategory, string> = {
  client: '가명 사전의 고객사 이름',
  project: '가명 사전의 프로젝트 이름',
  person: '가명 사전의 담당자 이름',
  system: '가명 사전의 시스템 이름',
  ip: '10.0.3.15, 192.168.0.0/24 같은 주소',
  path: 'C:\\… 나 \\\\서버\\공유 같은 경로',
  email: '이메일 주소',
  phone: '010·02·070·15xx·+82 전화번호',
  url: '아래 사내 도메인의 주소'
}

/** 가명 처리(설계 문서 §8): 기본 모드, 가릴 것, 사내 도메인, 대응표 보관 시간, 빼기 표기, 가명 사전 */
export function MaskingTab(): React.JSX.Element {
  const { snapshot, save, revision } = useSettingsCtx()
  const m = snapshot.settings.masking
  const [domainInput, setDomainInput] = useState('')
  const [domainError, setDomainError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Partial<Record<MaskCategory, string>>>(m.removeLabels ?? {})

  const addDomains = async (): Promise<void> => {
    const { domains, invalid } = parseDomainsInput(domainInput)
    if (invalid.length) {
      setDomainError(`도메인이 아니에요: ${invalid.join(', ')} (예: intra.example.com)`)
      return
    }
    if (!domains.length) return
    const next = [...new Set([...m.internalDomains, ...domains])]
    if (next.length > SETTINGS_LIMITS.internalDomains) {
      setDomainError(`사내 도메인은 ${SETTINGS_LIMITS.internalDomains}개까지예요`)
      return
    }
    setDomainError(null)
    if (await save({ masking: { internalDomains: next } })) setDomainInput('')
  }

  const commitLabel = (c: MaskCategory): void => {
    const v = (labels[c] ?? '').trim()
    const cur = m.removeLabels?.[c] ?? ''
    if (v === cur) return
    void save({ masking: { removeLabels: { [c]: v === '' ? null : v } } })
  }

  const categoryRow = (c: MaskCategory): React.JSX.Element => (
    <Row key={c} label={MASK_CATEGORY_LABELS[c]} description={CATEGORY_HINTS[c]}>
      {(ids) => <Toggle {...ids} checked={m.categories[c]} onChange={(on) => void save({ masking: { categories: { [c]: on } } })} />}
    </Row>
  )

  return (
    <>
      <Section title="기본 모드">
        <Row
          label="프롬프트를 만들 때"
          description="가명 처리는 고객사·IP·경로 같은 정보를 AI에 보내기 전에 다른 이름으로 바꾸는 기능이에요. 프롬프트마다·실행마다 바꿀 수 있고, 팔레트에서 Alt+M으로도 바뀌어요"
          stack
        >
          {(ids) => (
            <div className="flex flex-col gap-3">
              <RadioList<MaskingMode>
                {...ids}
                value={m.mode}
                options={SETTING_MASKING_MODES.map((mode) => ({ value: mode, label: maskingModeLabel(mode), description: MASKING_EXPLAIN[mode] }))}
                onChange={(mode) => void save({ masking: { mode } })}
              />
              <MaskingExample mode={m.mode} />
            </div>
          )}
        </Row>
      </Section>

      <Section title="사전으로 찾는 이름">{ENTITY_CATEGORIES.map(categoryRow)}</Section>
      <Section title="모양으로 찾는 정보">{PATTERN_CATEGORIES.map(categoryRow)}</Section>

      <Section title={`사내 도메인 (${m.internalDomains.length}/${SETTINGS_LIMITS.internalDomains})`}>
        <Row label="사내 주소로 볼 도메인" description="이 도메인과 그 아래 주소를 사내 URL로 가려요. 쉼표나 줄바꿈으로 여러 개를 넣을 수 있어요" stack>
          {(ids) => (
            <div className="flex flex-col gap-2">
              {m.internalDomains.length ? (
                <ul className="flex flex-wrap gap-2" aria-labelledby={ids.labelId}>
                  {m.internalDomains.map((d) => (
                    <li key={d} className="flex h-7 items-center gap-1 rounded-control bg-row-selected pr-1 pl-2.5 text-small text-fg">
                      {d}
                      <button
                        type="button"
                        aria-label={`${d} 빼기`}
                        onClick={() => void save({ masking: { internalDomains: m.internalDomains.filter((x) => x !== d) } })}
                        className="grid size-5 place-items-center rounded-control text-fg-2 hover:bg-row-hover hover:text-fg"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center gap-2">
                <TextField value={domainInput} onChange={setDomainInput} onCommit={() => void addDomains()} placeholder="intra.example.com" labelId={ids.labelId} invalid={domainError !== null} />
                <Button onClick={() => void addDomains()}>더하기</Button>
              </div>
              <p role={domainError ? 'alert' : undefined} className="min-h-5 text-small text-danger">
                {domainError ?? ''}
              </p>
            </div>
          )}
        </Row>
      </Section>

      <Section title="대응표">
        <Row label="되돌리기 대응표를 둘 시간" description="그 시간 안의 프롬프트는 같은 이름에 같은 가명을 써요. 대응표는 디스크에 저장하지 않아요">
          {(ids) => (
            <Slider
              {...ids}
              resetKey={revision}
              value={m.ttlHours}
              min={SETTINGS_LIMITS.ttlHours.min}
              max={SETTINGS_LIMITS.ttlHours.max}
              step={1}
              format={(v) => `${v}시간`}
              onCommit={(ttlHours) => void save({ masking: { ttlHours } })}
            />
          )}
        </Row>
      </Section>

      <Section title="‘바꾸기만’에서 쓰는 이름">
        {[...ENTITY_CATEGORIES, ...PATTERN_CATEGORIES].map((c) => (
          <Row key={c} label={MASK_CATEGORY_LABELS[c]} description={ENTITY_CATEGORIES.includes(c as never) ? '뒤에 A, B…가 붙어요' : undefined}>
            {(ids) => (
              <TextField
                labelId={ids.labelId}
                describedBy={ids.descId}
                value={labels[c] ?? ''}
                placeholder={`${defaultRemoveLabel(c)} (기본)`}
                maxLength={SETTINGS_LIMITS.removeLabel}
                width="w-44"
                onChange={(v) => setLabels({ ...labels, [c]: v })}
                onCommit={() => commitLabel(c)}
              />
            )}
          </Row>
        ))}
      </Section>

      <Section title="가명 사전">
        <DictionaryEditor />
      </Section>
    </>
  )
}
