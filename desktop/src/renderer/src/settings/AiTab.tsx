import { useId, useState } from 'react'
import { isOpenableUrl, type AiTarget } from '../../../shared/ai-targets'
import { withObjectParticle } from '../../../shared/josa'
import { SETTINGS_LIMITS } from '../../../shared/settings/settings'
import { Button, RadioList, Row, Section, TextField } from './controls'
import { useSettingsCtx } from './use-settings'

/** 대상 설명: 열 주소의 호스트, 주소가 없으면 복사만 */
function targetDescription(t: AiTarget): string {
  if (!t.url) return '주소를 열지 않고 클립보드에 복사만 해요'
  try {
    return `${withObjectParticle(new URL(t.url).host)} 기본 브라우저로 열어요`
  } catch {
    return t.url
  }
}

type Draft = { id: string | null; name: string; url: string }
const EMPTY: Draft = { id: null, name: '', url: '' }

/** 입력 중인 사용자 대상의 문제(없으면 null). main이 다시 검사하지만 저장 전에 그 자리에서 알린다 */
export function draftProblem(d: Draft, others: AiTarget[]): string | null {
  const name = d.name.trim()
  if (!name) return '이름을 적어 주세요'
  if (name.length > SETTINGS_LIMITS.targetName) return `이름은 ${SETTINGS_LIMITS.targetName}자까지예요`
  if (!isOpenableUrl(d.url.trim())) return '주소는 http:// 또는 https://로 시작해야 해요'
  if (others.some((t) => t.id !== d.id && t.name === name)) return '같은 이름의 대상이 있어요'
  return null
}

/** AI 대상: 기본 대상 고르기, 사내 LLM 같은 대상 더하기·고치기·지우기(설계 문서 §7) */
export function AiTab(): React.JSX.Element {
  const { snapshot, save } = useSettingsCtx()
  const s = snapshot.settings
  const custom = s.ai.custom
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [tried, setTried] = useState(false)
  const formId = useId()
  const problem = draftProblem(draft, custom)

  const submit = async (): Promise<void> => {
    setTried(true)
    if (problem) return
    const target: AiTarget = { id: draft.id ?? `custom-${Date.now().toString(36)}`, name: draft.name.trim(), url: draft.url.trim() }
    const next = draft.id ? custom.map((t) => (t.id === draft.id ? target : t)) : [...custom, target]
    if (await save({ ai: { custom: next } })) {
      setDraft(EMPTY)
      setTried(false)
    }
  }

  return (
    <>
      <Section title="기본 AI 대상">
        <Row label="프롬프트를 붙여 넣을 AI" description="회사에서 쓰도록 허용된 AI를 골라 주세요. 프롬프트마다 따로 정할 수도 있어요" stack>
          {(ids) => (
            <RadioList
              {...ids}
              value={s.ai.defaultTarget}
              options={snapshot.aiTargets.map((t) => ({ value: t.id, label: t.name, description: targetDescription(t) }))}
              onChange={(defaultTarget) => void save({ ai: { defaultTarget } })}
            />
          )}
        </Row>
      </Section>

      <Section title="내가 더한 대상">
        {custom.length === 0 ? (
          <p className="border-b border-line px-4 py-3 text-small leading-5 text-fg-2">사내 LLM처럼 목록에 없는 AI를 아래에서 더할 수 있어요.</p>
        ) : (
          custom.map((t) => (
            <Row key={t.id} label={t.name} description={t.url}>
              {() => (
                <div className="flex gap-2">
                  <Button onClick={() => setDraft({ id: t.id, name: t.name, url: t.url ?? '' })}>고치기</Button>
                  <Button
                    kind="danger"
                    disabled={s.ai.defaultTarget === t.id}
                    label={s.ai.defaultTarget === t.id ? `${t.name}: 기본 대상이라 지울 수 없어요` : `${t.name} 지우기`}
                    onClick={() => void save({ ai: { custom: custom.filter((x) => x.id !== t.id) } })}
                  >
                    지우기
                  </Button>
                </div>
              )}
            </Row>
          ))
        )}
        <div className="flex flex-col gap-2 px-4 py-3" role="group" aria-labelledby={`${formId}-title`}>
          <div id={`${formId}-title`} className="text-body leading-5 text-fg">
            {draft.id ? '대상 고치기' : '대상 더하기'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TextField value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="이름 (예: 사내 LLM)" width="w-44" maxLength={SETTINGS_LIMITS.targetName} />
            <TextField
              value={draft.url}
              onChange={(url) => setDraft({ ...draft, url })}
              onCommit={() => void submit()}
              placeholder="https://"
              width="w-72"
              invalid={tried && problem !== null}
              describedBy={`${formId}-problem`}
            />
            <Button kind="primary" onClick={() => void submit()}>
              {draft.id ? '고친 내용 저장' : '더하기'}
            </Button>
            {draft.id ? <Button onClick={() => setDraft(EMPTY)}>그만두기</Button> : null}
          </div>
          <p id={`${formId}-problem`} role={tried && problem ? 'alert' : undefined} className="min-h-5 text-small leading-5 text-danger">
            {tried && problem ? problem : ''}
          </p>
        </div>
      </Section>
    </>
  )
}
