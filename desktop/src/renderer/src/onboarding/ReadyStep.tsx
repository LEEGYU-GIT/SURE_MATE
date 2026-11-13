import { useEffect, useId, useState, type ReactNode } from 'react'
import { pickAiTarget } from '../../../shared/ai-targets'
import { repickParticle } from '../../../shared/josa'
import { maskingModeLabel } from '../../../shared/labels'
import { PET_RECALL_HINT } from '../../../shared/pet/pet-copy'
import { SETTING_MASKING_MODES } from '../../../shared/settings/settings'
import type { SettingsPatch } from '../../../shared/settings/settings-patch'
import type { HotkeyCandidate, SettingsSnapshot } from '../../../shared/settings/settings-snapshot'
import type { MaskingMode } from '../../../shared/types'
import { MASKING_DETAILS } from '../flyout/menu-model'
import { NoticeLine, RadioList, Segmented, Toggle, type Notice } from '../settings/controls'
import { MateStage } from './MateStage'
import { Keycap, RecorderField, StepTitle } from './parts'

/** 조합 뒤 '(으)로': 마지막 소리에 맞춘다(Alt+`처럼 모르면 '로') */
const toward = (word: string): string => repickParticle(word, '로')?.particle ?? '로'

/**
 * 첫 실행 안내 3 / 3: 준비 완료(2026-11-12 사용자 확인). 왼쪽은 말랑 메이트 인사(그림·하는 일·보이기), 오른쪽은 기본값 요약 한 줄씩과
 * 그 자리에서 펼치는 [바꾸기](다른 화면으로 가지 않는다). 바꾼 값은 바로 설정에 저장한다(설정 창과 같은 저장 길).
 * 팔레트 단축키가 등록돼 있지 않으면(다른 앱이 조합을 씀) 단축키 고르기를 펼쳐 두고, 등록할 때까지 시작할 수 없다(화면이 막는다)
 */
export function ReadyStep({
  snap,
  setSnap,
  hotkey,
  forced,
  onHotkey,
  reduceMotion
}: {
  snap: SettingsSnapshot
  setSnap(s: SettingsSnapshot): void
  /** 등록된 팔레트 단축키(없으면 null) */
  hotkey: string | null
  /** 단축키 고르기를 접을 수 없게 펼쳐 둔다(hotkeyPickerForced) */
  forced: boolean
  onHotkey(acc: string): void
  reduceMotion: boolean
}): React.JSX.Element {
  const api = window.sureMate.settings
  /** 저장하고, 실패하면 화면에 보일 문구 */
  const save = async (patch: SettingsPatch): Promise<string | null> => {
    const r = await api.update(patch).catch(() => null)
    if (r?.ok) {
      setSnap(r.snapshot)
      return null
    }
    return (r && r.errors.join(' ')) || '저장하지 못했어요. 다시 해 주세요.'
  }
  return (
    <>
      <StepTitle title={hotkey ? '준비됐어요' : '팔레트 단축키만 정하면 끝나요'}>
        {hotkey
          ? '지금 설정 그대로 바로 쓸 수 있어요. 바꾸고 싶은 것만 그 자리에서 바꿔 두세요.'
          : '다른 설정은 이미 준비됐어요. 아래에서 비어 있는 조합을 하나 골라 주세요.'}
      </StepTitle>
      <div className="grid grid-cols-1 gap-5 @min-[600px]:grid-cols-[248px_minmax(0,1fr)]">
        <MateCard snap={snap} save={save} reduceMotion={reduceMotion} />
        <Defaults snap={snap} save={save} hotkey={hotkey} forced={forced} onHotkey={onHotkey} />
      </div>
    </>
  )
}

/** 말랑 메이트 인사: 바 위를 걷는 그림, 하는 일 한 단락, 보이기 스위치(숨겨도 다시 부르는 곳) */
function MateCard({
  snap,
  save,
  reduceMotion
}: {
  snap: SettingsSnapshot
  save(p: SettingsPatch): Promise<string | null>
  reduceMotion: boolean
}): React.JSX.Element {
  const id = useId()
  const pet = snap.settings.pet
  const [error, setError] = useState<string | null>(null)
  return (
    <section
      aria-labelledby={`${id}-name`}
      className="flex flex-col self-start rounded-window bg-surface-inset p-4"
    >
      <MateStage
        size={pet.size}
        activity={pet.activity}
        sunglasses={snap.settings.masking.mode !== 'off'}
        reduceMotion={reduceMotion || pet.reduceMotion}
        hidden={!pet.visible}
        greeting="반가워요!"
      />
      <h2 id={`${id}-name`} className="mt-3 text-body leading-5 font-semibold text-fg">
        말랑 메이트예요
      </h2>
      <p className="mt-1 text-small leading-5 text-pretty break-keep text-fg-2">
        바 위를 걸어 다니다가 프롬프트를 복사하거나 원래 이름을 되돌리면 반응해요. 오른쪽 클릭하면{' '}
        <span className="whitespace-nowrap">조종하기·재우기·숨기기</span> 메뉴가 열려요.
      </p>
      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <div className="min-w-0 flex-1">
          <p id={`${id}-visible`} className="text-body leading-5 text-fg">
            말랑 메이트 보이기
          </p>
          <p id={`${id}-visible-desc`} className="text-caption leading-4 break-keep text-fg-2">
            숨겨도 {PET_RECALL_HINT}
          </p>
        </div>
        <Toggle
          labelId={`${id}-visible`}
          descId={`${id}-visible-desc`}
          checked={pet.visible}
          onChange={(visible) => void save({ pet: { visible } }).then(setError)}
        />
      </div>
      {error ? <NoticeLine notice={{ tone: 'error', text: error }} className="mt-2" /> : null}
    </section>
  )
}

/** 기본값 요약: 팔레트 단축키, 주로 쓰는 AI, 가명 처리, 로그인할 때 자동 실행 */
function Defaults({
  snap,
  save,
  hotkey,
  forced,
  onHotkey
}: {
  snap: SettingsSnapshot
  save(p: SettingsPatch): Promise<string | null>
  hotkey: string | null
  forced: boolean
  onHotkey(acc: string): void
}): React.JSX.Element {
  const id = useId()
  const s = snap.settings
  const target = pickAiTarget({ defaultId: s.ai.defaultTarget, targets: snap.aiTargets })
  const targets = snap.aiTargets.map((t) => ({ value: t.id, label: t.name }))
  const [errors, setErrors] = useState<Partial<Record<'ai' | 'masking' | 'login', string>>>({})
  const saveRow = (row: 'ai' | 'masking' | 'login', patch: SettingsPatch): void =>
    void save(patch).then((e) => setErrors((prev) => ({ ...prev, [row]: e ?? undefined })))
  const mode = s.masking.mode
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      <h2 id={`${id}-title`} className="px-1 text-caption leading-4 font-semibold text-fg-2">
        기본 설정
      </h2>
      <div className="flex flex-col rounded-window bg-surface-inset">
        <DefaultRow
          label="팔레트 단축키"
          value={
            hotkey ? (
              <Keycap>{hotkey}</Keycap>
            ) : (
              <span className="font-semibold text-danger">등록 못 함</span>
            )
          }
          forced={forced}
        >
          {(labelId) => (
            <PalettePicker
              labelId={labelId}
              current={hotkey}
              unregistered={!hotkey}
              onPicked={onHotkey}
            />
          )}
        </DefaultRow>
        <DefaultRow
          label="주로 쓰는 AI"
          value={target.name}
          error={errors.ai}
        >
          {(labelId) => (
            <div className="flex flex-col gap-2">
              {targets.length <= 5 ? (
                <Segmented
                  labelId={labelId}
                  value={target.id}
                  options={targets}
                  onChange={(defaultTarget) => saveRow('ai', { ai: { defaultTarget } })}
                />
              ) : (
                <RadioList
                  labelId={labelId}
                  value={target.id}
                  options={targets}
                  onChange={(defaultTarget) => saveRow('ai', { ai: { defaultTarget } })}
                />
              )}
              <p className="text-caption leading-4 break-keep text-fg-2">
                ‘복사만’은 AI를 열지 않고 클립보드에만 넣어요
              </p>
            </div>
          )}
        </DefaultRow>
        <DefaultRow
          label="가명 처리"
          value={
            <span className={mode === 'off' ? 'font-semibold text-warn' : undefined}>
              {maskingModeLabel(mode)}
            </span>
          }
          detail={MASKING_DETAILS[mode]}
          error={errors.masking}
        >
          {(labelId) => (
            <RadioList<MaskingMode>
              labelId={labelId}
              value={mode}
              options={SETTING_MASKING_MODES.map((m) => ({
                value: m,
                label: maskingModeLabel(m),
                description: MASKING_DETAILS[m]
              }))}
              onChange={(next) => saveRow('masking', { masking: { mode: next } })}
            />
          )}
        </DefaultRow>
        <LoginRow
          checked={s.launchAtLogin}
          packaged={snap.packaged}
          error={errors.login}
          onChange={(launchAtLogin) => saveRow('login', { launchAtLogin })}
        />
      </div>
    </section>
  )
}

/**
 * 요약 한 줄: 왼쪽 이름(13 보조 글), 지금 값(14, 가명 처리는 그 아래 한 줄 설명), 오른쪽 [바꾸기]. 누르면 그 자리 아래에 고르는 칸을
 * 펼친다(aria-expanded). forced: 고를 때까지 접을 수 없게 펼쳐 둔다(팔레트 단축키가 없을 때). 처음부터 forced면 등록한 뒤에도
 * 펼친 채 결과를 보이고 [닫기]를 보인다
 */
function DefaultRow({
  label,
  value,
  detail,
  error,
  forced = false,
  children
}: {
  label: string
  value: ReactNode
  detail?: string
  error?: string
  forced?: boolean
  children(labelId: string): ReactNode
}): React.JSX.Element {
  const id = useId()
  const [openByUser, setOpen] = useState(forced)
  const open = forced || openByUser
  return (
    <div className="border-b border-line px-4 py-2 last:border-b-0">
      <div className="flex min-h-8 items-center gap-3">
        <p id={`${id}-label`} className="w-24 shrink-0 self-start pt-1.5 text-small leading-5 break-keep text-fg-2">
          {label}
        </p>
        <div className="min-w-0 flex-1">
          <div className="text-body leading-6 text-fg">{value}</div>
          {detail ? (
            <p className="text-small leading-5 text-balance break-keep text-fg-2">{detail}</p>
          ) : null}
        </div>
        {forced ? null : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? `${id}-panel` : undefined}
            onClick={() => setOpen((o) => !o)}
            className="h-8 shrink-0 self-start rounded-control border border-line px-3 text-small whitespace-nowrap text-fg transition-colors duration-(--dur-hover) hover:bg-row-hover"
          >
            <span className="sr-only">{label} </span>
            {open ? '닫기' : '바꾸기'}
          </button>
        )}
      </div>
      {open ? (
        <div id={`${id}-panel`} className="guide-reveal mt-2">
          {children(`${id}-label`)}
        </div>
      ) : null}
      {error ? <NoticeLine notice={{ tone: 'error', text: error }} className="mt-2" /> : null}
    </div>
  )
}

/** 로그인할 때 자동 실행: 켬·끔 하나라 스위치를 그 자리에 둔다(설치본이 아니면 저장만 한다는 설명, 설정 일반 탭과 같은 말) */
function LoginRow({
  checked,
  packaged,
  error,
  onChange
}: {
  checked: boolean
  packaged: boolean
  error?: string
  onChange(v: boolean): void
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="border-b border-line px-4 py-2 last:border-b-0">
      <div className="flex min-h-8 items-center gap-3">
        <p id={`${id}-label`} className="w-24 shrink-0 self-start pt-1.5 text-small leading-5 break-keep text-fg-2">
          {/* 낱말 안에서 끊지 않고(break-keep), '자동 실행'이 두 줄로 나뉘지 않게 U+00A0으로 붙인다 */}
          {'로그인할 때 자동 실행'}
        </p>
        <p id={`${id}-desc`} className="min-w-0 flex-1 text-small leading-5 break-keep text-fg-2">
          {packaged
            ? 'Windows에 로그인하면 트레이에서 기다려요'
            : '개발 실행이라 저장만 하고, 설치한 앱에서 적용돼요'}
        </p>
        <Toggle labelId={`${id}-label`} descId={`${id}-desc`} checked={checked} onChange={onChange} />
      </div>
      {error ? <NoticeLine notice={{ tone: 'error', text: error }} className="mt-2" /> : null}
    </div>
  )
}

/**
 * 팔레트 단축키 고르기(main의 5단계 안내 ②와 같은 내용, 설계 §6): 후보(비어 있는지, 추천)와 "다른 조합 직접 고르기" 녹화 칸.
 * 고르는 즉시 등록해 보고, 실패하면 까닭을 빨간 줄로 남긴다(다음에 성공할 때까지). 등록하지 못한 상태면 맨 위에 빨간 까닭 한 줄
 */
function PalettePicker({
  labelId,
  current,
  unregistered,
  onPicked
}: {
  labelId: string
  current: string | null
  unregistered: boolean
  onPicked(acc: string): void
}): React.JSX.Element {
  const api = window.sureMate.settings
  const [candidates, setCandidates] = useState<HotkeyCandidate[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<Notice | null>(null)
  useEffect(() => {
    void api.onboardingCandidates().then(setCandidates)
  }, [api])
  const succeeded = (acc: string, warning?: string): void => {
    onPicked(acc)
    setProblem(null)
    const head = `이제 ${acc}${toward(acc)} 팔레트를 열어요`
    setDone(warning ? { tone: 'warn', text: `${head} · ${warning}` } : { tone: 'ok', text: head })
  }
  const pick = async (acc: string): Promise<void> => {
    setProblem(null)
    setDone(null)
    const r = await api.hotkeySet('palette', acc)
    if (r.ok) succeeded(r.acc ?? acc, r.warning)
    else setProblem(`${acc}: ${r.reason}`)
  }
  return (
    <div className="flex flex-col gap-2">
      {unregistered && !problem ? (
        <NoticeLine
          notice={{
            tone: 'error',
            text: '다른 앱이 이미 쓰는 조합이라 팔레트 단축키를 등록하지 못했어요.'
          }}
        />
      ) : null}
      {/* 누르는 즉시 등록해 보므로 라디오(화살표로 고르면 바로 바뀜) 대신 눌림 상태 단추로 둔다 */}
      <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
        {(candidates ?? []).map((c) => {
          const on = current === c.acc
          return (
            <button
              key={c.acc}
              type="button"
              aria-pressed={on}
              disabled={!c.available}
              onClick={() => void pick(c.acc)}
              className={`flex items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-(--dur-hover) disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? 'border-brand bg-row-selected' : 'border-line hover:bg-row-hover'
              }`}
            >
              <Keycap>{c.acc}</Keycap>
              <span className="text-small text-fg-2">
                {c.available ? '비어 있어요' : '다른 앱이 쓰고 있어요'}
              </span>
              {c.suggested ? (
                <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-caption font-semibold text-brand">
                  추천
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <RecorderField
        id="palette"
        label="다른 조합 직접 고르기"
        labelledBy={labelId}
        onRecorded={(r) => succeeded(r.acc, r.warning)}
      />
      {problem ? <NoticeLine notice={{ tone: 'error', text: problem }} /> : null}
      {done ? <NoticeLine notice={done} /> : null}
    </div>
  )
}
