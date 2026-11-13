import { useEffect, useId, useRef, useState } from 'react'
import { withObjectParticle } from '../../../shared/josa'
import { PET_CONTROL_KEYS, PET_NUDGE_LINES, PET_RECALL_HINT, petAwayLine } from '../../../shared/pet/pet-copy'
import {
  PET_AWAY_LEAD_MINUTES,
  PET_AWAY_MINUTES,
  PET_LIMITS,
  PET_NUDGE_MINUTES,
  PET_SIZES,
  type PetActivity,
  type PetAwayLeadMin,
  type PetAwayMin,
  type PetNudgeMin,
  type PetSettings,
  type PetSize
} from '../../../shared/pet/pet-settings'
import type { PetLook } from '../../../shared/pet/pet-view'
import { PetSprite } from '../pet/PetSprite'
import { Button, Row, Section, Segmented, Slider, Toggle } from './controls'
import { HotkeyRecorder } from './HotkeyRecorder'
import { useSettingsCtx } from './use-settings'

const SIZE_LABELS: Record<PetSize, string> = { 40: '작게', 56: '보통', 72: '크게' }
const SIZES = PET_SIZES.map((s) => ({ value: String(s) as `${PetSize}`, label: SIZE_LABELS[s] }))
const ACTIVITIES: { value: PetActivity; label: string }[] = [
  { value: 'calm', label: '차분' },
  { value: 'normal', label: '보통' },
  { value: 'lively', label: '활발' }
]
const NUDGE_MINUTES = PET_NUDGE_MINUTES.map((m) => ({ value: String(m) as `${PetNudgeMin}`, label: `${m}분` }))
const AWAY_MINUTES = PET_AWAY_MINUTES.map((m) => ({ value: String(m) as `${PetAwayMin}`, label: `${m}분` }))
const AWAY_LEAD_MINUTES = PET_AWAY_LEAD_MINUTES.map((m) => ({ value: String(m) as `${PetAwayLeadMin}`, label: `${m}분 전` }))

/** 이석 미리 알림 말풍선의 첫 문장(끝 마침표 뺌). 설명에 따옴표로 넣는다: "2분 뒤 이석으로 잡혀요" */
const awayHead = (lead: PetAwayLeadMin): string => petAwayLine(lead).split('. ')[0]

/** 이석 미리 알림을 말풍선으로 보일 수 없는 까닭(숨김을 먼저 본다). 그때는 Windows 알림으로 알린다. 보일 수 있으면 null */
function awayNoBubble(pet: Pick<PetSettings, 'visible' | 'bubbles'>): string | null {
  if (!pet.visible) return '말랑 메이트가 숨어 있어'
  if (!pet.bubbles) return '말풍선이 꺼져 있어'
  return null
}

/**
 * 말랑 메이트(설계 문서 §14·§14-2): 보이기와 크기, 움직임, 반응과 말풍선(쉬어 가기 말 포함), Ttree 이석 미리 알림, 조종 단축키.
 * 캐릭터 고르기(§14-3)는 아직 없다.
 * 쉬어 가기 말 간격은 켜 둔 동안만 보이고, 말풍선을 끄면 쉬어 가기 말 행이 지금은 말을 걸지 않는다고 알린다.
 * 이석 기준·미리 알림도 켜 둔 동안만 보이고, 펫을 숨기거나 말풍선을 끄면 이석 미리 알림 행이 Windows 알림으로 알린다고 적는다.
 * 바꾼 값은 그 자리에서 저장하고(설정 서비스 → 설정 쓰기 한 줄), 저장 뒤 펫이 바로 다시 판단한다.
 * 조종 단축키는 등록해 보고 실패하면 되돌려야 해서 단축키 탭과 같은 녹화 칸(단축키 바꾸기)으로 바꾼다.
 */
export function PetTab(): React.JSX.Element {
  const { snapshot, save, revision } = useSettingsCtx()
  const pet = snapshot.settings.pet
  const { min, max } = PET_LIMITS.sleepAfterMin
  const awayFallback = awayNoBubble(pet)
  return (
    <>
      <Section title="보이기와 크기">
        <Row label="말랑 메이트 보이기" description={`숨기면 ${PET_RECALL_HINT}`}>
          {(ids) => <Toggle {...ids} checked={pet.visible} onChange={(visible) => void save({ pet: { visible } })} />}
        </Row>
        <Row label="크기" description="오른쪽 그림이 바탕화면에서 보일 실제 크기예요">
          {(ids) => (
            <div className="flex items-center gap-4">
              <SizePreview size={pet.size} hidden={!pet.visible} />
              <Segmented
                {...ids}
                value={String(pet.size) as `${PetSize}`}
                options={SIZES}
                onChange={(v) => void save({ pet: { size: Number(v) as PetSize } })}
              />
            </div>
          )}
        </Row>
      </Section>

      <Section title="움직임">
        <Row label="활발함" description="얼마나 빨리, 얼마나 자주 돌아다닐지 정해요">
          {(ids) => <Segmented {...ids} value={pet.activity} options={ACTIVITIES} onChange={(activity) => void save({ pet: { activity } })} />}
        </Row>
        <Row
          label="졸기까지"
          description={
            <>
              키보드와 마우스를 이만큼 쓰지 않으면 졸아요.
              <br />
              펫에 마우스를 올리면 깨요
            </>
          }
        >
          {(ids) => (
            <Slider
              {...ids}
              resetKey={revision}
              value={pet.sleepAfterMin}
              min={min}
              max={max}
              step={1}
              format={(v) => `${v}분`}
              onCommit={(sleepAfterMin) => void save({ pet: { sleepAfterMin } })}
            />
          )}
        </Row>
        <Row
          label="움직임 줄이기"
          description={
            <>
              부풀기·튀기·흔들림 없이 자리만 옮겨요.
              <br />
              Windows에서 &apos;애니메이션 효과&apos;를 끄면 이 설정과 상관없이 줄여요
            </>
          }
        >
          {(ids) => <Toggle {...ids} checked={pet.reduceMotion} onChange={(reduceMotion) => void save({ pet: { reduceMotion } })} />}
        </Row>
      </Section>

      <Section title="반응과 말풍선">
        <Row label="반응" description="프롬프트를 복사하거나 가명을 되돌리면 몸짓과 표정으로 알려 줘요">
          {(ids) => <Toggle {...ids} checked={pet.reactions} onChange={(reactions) => void save({ pet: { reactions } })} />}
        </Row>
        <Row label="말풍선" description="복사 결과나 조종 안내, 쉬어 가기 말을 펫 위 말풍선으로 보여 줘요">
          {(ids) => <Toggle {...ids} checked={pet.bubbles} onChange={(bubbles) => void save({ pet: { bubbles } })} />}
        </Row>
        <Row
          label="쉬어 가기 말 걸기"
          description={
            <>
              한참 일하면 &apos;{PET_NUDGE_LINES[0]}&apos;처럼 쉬어 가자고 말을 걸어요
              {pet.nudges && !pet.bubbles ? (
                <>
                  <br />
                  <span className="text-warn">말풍선이 꺼져 있어 지금은 말을 걸지 않아요</span>
                </>
              ) : null}
            </>
          }
        >
          {(ids) => <Toggle {...ids} checked={pet.nudges} onChange={(nudges) => void save({ pet: { nudges } })} />}
        </Row>
        {pet.nudges ? (
          <Row
            label="말 거는 간격"
            description={
              <>
                키보드나 마우스를 쓰는 시간만 재요.
                <br />
                10분 넘게 쉬면 처음부터 다시 재요
              </>
            }
          >
            {(ids) => (
              <Segmented
                {...ids}
                value={String(pet.nudgeEveryMin) as `${PetNudgeMin}`}
                options={NUDGE_MINUTES}
                onChange={(v) => void save({ pet: { nudgeEveryMin: Number(v) as PetNudgeMin } })}
              />
            )}
          </Row>
        ) : null}
      </Section>

      <Section title="Ttree 이석 미리 알림">
        <Row
          label="이석 전에 알려 주기"
          description={
            <>
              키보드와 마우스를 안 쓴 채 이석 기준이 다가오면 말랑 메이트가 &apos;{awayHead(pet.awayLeadMin)}&apos;라고 알려 줘요.
              <br />
              Ttree가 설치된 PC에서만 알리고, 마우스를 대신 움직이지는 않아요
              {pet.awayWarn && awayFallback ? (
                <>
                  <br />
                  <span className="text-warn">{awayFallback} 지금은 Windows 알림으로 알려요</span>
                </>
              ) : null}
            </>
          }
        >
          {(ids) => (
            // 미리 보기는 켬·끔과 상관없이 늘 보인다(입력 없이 기다리지 않고 지금 한 번 알린다). 스위치는 다른 행처럼 오른쪽 끝에 둔다
            <div className="flex items-center gap-4">
              <Button
                label="이석 알림 미리 보기"
                onClick={() => window.sureMate.settings.awayPreview()}
              >
                미리 보기
              </Button>
              <Toggle
                {...ids}
                checked={pet.awayWarn}
                onChange={(awayWarn) => void save({ pet: { awayWarn } })}
              />
            </div>
          )}
        </Row>
        {pet.awayWarn ? (
          <>
            <Row
              label="Ttree 이석 기준"
              description={
                <>
                  키보드와 마우스를 이만큼 안 쓰면 Ttree가 이석으로 잡아요.
                  <br />
                  회사 설정과 같게 맞춰 주세요
                </>
              }
            >
              {(ids) => (
                <Segmented
                  {...ids}
                  value={String(pet.awayAfterMin) as `${PetAwayMin}`}
                  options={AWAY_MINUTES}
                  onChange={(v) => void save({ pet: { awayAfterMin: Number(v) as PetAwayMin } })}
                />
              )}
            </Row>
            <Row label="미리 알림" description={`키보드와 마우스를 ${pet.awayAfterMin - pet.awayLeadMin}분 안 쓰면 알려요`}>
              {(ids) => (
                <Segmented
                  {...ids}
                  value={String(pet.awayLeadMin) as `${PetAwayLeadMin}`}
                  options={AWAY_LEAD_MINUTES}
                  onChange={(v) => void save({ pet: { awayLeadMin: Number(v) as PetAwayLeadMin } })}
                />
              )}
            </Row>
          </>
        ) : null}
      </Section>

      <Section title="조종">
        <ControlHotkeyRow />
      </Section>
    </>
  )
}

/** 크기 미리 보기의 모습: 가만히 선 기본 얼굴. 설정 창에서는 움직이지 않는다(크기만 보인다) */
const STILL: PetLook = { pose: 'stand', face: 'normal', props: [], facing: 'left', cue: null, cueSeq: 0 }
/** 64 격자의 바닥선(y=58) 아래 여백. 발이 미리 보기 바닥 선에 닿게 그만큼 내린다 */
const BELOW_FEET = 6 / 64

/**
 * 고른 크기 그대로의 펫(설정 창도 DIP라 바탕화면과 같은 크기). 가장 큰 크기(72)의 자리에 바닥을 맞춰 세우고,
 * 숨겨 두었으면 옅게 그린다. 설명 글이 있어 화면 읽기 프로그램에는 감춘다.
 */
function SizePreview({ size, hidden }: { size: PetSize; hidden: boolean }): React.JSX.Element {
  return (
    <div aria-hidden="true" className="flex size-18 items-end justify-center border-b border-line">
      <div className={`flex transition-opacity duration-(--dur-hover) ${hidden ? 'opacity-40' : ''}`} style={{ marginBottom: -Math.round(size * BELOW_FEET) }}>
        <PetSprite look={STILL} size={size} reduceMotion />
      </div>
    </div>
  )
}

type Notice = { text: string; tone: 'ok' | 'warn' | 'error' }
const NOTICE_TONE: Record<Notice['tone'], string> = { ok: 'text-fg-2', warn: 'text-warn', error: 'text-danger' }

/**
 * 조종 단축키(설계 §14-2, 기본 없음): 지금 조합(없으면 '없음')·등록 상태, 정하기·바꾸기(단축키 탭과 같은 녹화 칸), 지우기.
 * 녹화 칸이나 지우기 단추가 사라져 포커스를 잃으면 정하기·바꾸기 단추로 돌려준다(키보드만으로 사용, §16).
 */
function ControlHotkeyRow(): React.JSX.Element {
  const { snapshot } = useSettingsCtx()
  const api = window.sureMate.settings
  const h = snapshot.hotkeys['pet-control']
  const id = useId()
  const labelId = `${id}-label`
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const changeRef = useRef<HTMLButtonElement>(null)
  const clearing = useRef(false)

  // 녹화가 Esc·바꾸기로 끝나면 녹화 칸이 사라져 포커스가 문서로 빠진다: 정하기·바꾸기 단추로 돌려준다(Tab으로 떠났으면 그대로)
  const wasRecording = useRef(false)
  useEffect(() => {
    if (wasRecording.current && !recording) {
      const active = document.activeElement
      if (!active || active === document.body) changeRef.current?.focus()
    }
    wasRecording.current = recording
  }, [recording])

  const clear = async (): Promise<void> => {
    if (clearing.current) return
    clearing.current = true
    // 지우기 단추는 곧 사라진다: 포커스를 먼저 옆 단추로 옮긴다
    changeRef.current?.focus()
    setNotice(null)
    try {
      const r = await api.hotkeySet('pet-control', null)
      setNotice(r.ok ? { text: '조종 단축키를 지웠어요', tone: 'ok' } : { text: r.reason, tone: 'error' })
    } catch {
      setNotice({ text: '조종 단축키를 지우지 못했어요. 다시 해 주세요', tone: 'error' })
    } finally {
      clearing.current = false
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* 창이 좁으면(최소 720) 조합·단추 묶음이 설명 아래로 내려간다(설명이 몇 글자 폭으로 눌리지 않게) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-60 flex-1">
          <div id={labelId} className="text-body leading-5 text-fg">
            조종 단축키
          </div>
          <div className="mt-0.5 text-small leading-5 text-balance break-keep text-fg-2">
            누르면 키보드로 펫을 움직여요.
            <br />
            없어도 펫 메뉴나 팔레트에서 조종할 수 있어요
          </div>
          <div className="mt-1 text-caption leading-4 break-keep text-fg-3">{PET_CONTROL_KEYS}</div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <kbd className={`rounded-control border border-line bg-surface-inset px-2 py-1 font-ui text-small whitespace-nowrap ${h.acc ? 'text-fg' : 'text-fg-3'}`}>
            {h.acc ?? '없음'}
          </kbd>
          {h.acc ? (
            <span className={`text-small whitespace-nowrap ${h.registered ? 'text-fg-2' : 'text-danger'}`}>{h.registered ? '쓰는 중' : '등록 못 함'}</span>
          ) : null}
          {recording ? null : (
            <div className="flex gap-2">
              <Button
                ref={changeRef}
                // 조합·등록 상태는 단추 밖 글자라 단추 이름에 함께 읽힌다
                label={h.acc ? `조종 단축키 바꾸기, 지금 ${h.acc}${h.registered ? '' : ', 등록 못 함'}` : '조종 단축키 정하기, 지금 없음'}
                onClick={() => {
                  setNotice(null)
                  setRecording(true)
                }}
              >
                {h.acc ? '바꾸기' : '정하기'}
              </Button>
              {h.acc ? (
                <Button label="조종 단축키 지우기" onClick={() => void clear()}>
                  지우기
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {recording ? (
        <HotkeyRecorder
          id="pet-control"
          labelledBy={labelId}
          onDone={(r) => {
            setRecording(false)
            if (!r) return
            const done = `이제 ${withObjectParticle(r.acc)} 누르면 조종해요`
            setNotice(r.warning ? { text: `${done} · ${r.warning}`, tone: 'warn' } : { text: done, tone: 'ok' })
          }}
        />
      ) : null}
      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-small break-keep ${NOTICE_TONE[notice.tone]}`}>
          {notice.text}
        </p>
      ) : null}
      {h.acc && !h.registered && !recording ? (
        <p className="text-small break-keep text-danger">다른 앱이 이 조합을 쓰고 있어 등록하지 못했어요. 다른 조합으로 바꿔 주세요.</p>
      ) : null}
    </div>
  )
}
