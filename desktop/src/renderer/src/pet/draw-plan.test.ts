import { describe, expect, it } from 'vitest'
import type { PetFace, PetLook, PetPose } from '../../../shared/pet/pet-view'
import { drawPlan, FACE_PARTS } from './draw-plan'

const look = (o: Partial<PetLook> = {}): PetLook => ({ pose: 'stand', face: 'normal', props: [], facing: 'right', cue: null, cueSeq: 0, ...o })
const moving = { reduceMotion: false }
const still = { reduceMotion: true }

describe('drawPlan: 모습(PetLook) → 그릴 것', () => {
  it('가만히·보통 얼굴: 점 눈·웃는 입·볼, 깜빡임, 숨쉬기, 뒤집지 않음', () => {
    const p = drawPlan(look(), moving)
    expect(p).toMatchObject({ pose: 'stand', eyes: 'dot', mouth: 'smile', brows: false, cheeks: true, blink: true, motion: 'breathe', mirror: false, cue: null })
  })

  it('선글라스를 쓰면 눈을 그리지 않고 깜빡이지 않는다(입은 그대로)', () => {
    const p = drawPlan(look({ props: ['sunglasses'] }), moving)
    expect(p.eyes).toBe('hidden')
    expect(p.blink).toBe(false)
    expect(p.mouth).toBe('smile')
    expect(p.props).toEqual(['sunglasses'])
  })

  it('왼쪽으로 걸으면 통통 걷기 움직임이고 좌우를 뒤집는다', () => {
    const p = drawPlan(look({ pose: 'walk', facing: 'left' }), moving)
    expect(p.motion).toBe('walk')
    expect(p.mirror).toBe(true)
  })

  it('졸기: 움직임·깜빡임 없음, z도 떠오르지 않음(졸 때는 애니메이션도 멈춘다), 감은 눈', () => {
    const p = drawPlan(look({ pose: 'sleep', face: 'asleep', props: ['zzz'] }), moving)
    expect(p).toMatchObject({ motion: 'none', blink: false, floatProps: false, eyes: 'line', mouth: 'none', props: ['zzz'] })
  })

  it('집어 들림·놀람: 대롱대롱 흔들림, 동그란 눈', () => {
    const p = drawPlan(look({ pose: 'held', face: 'surprised' }), moving)
    expect(p.motion).toBe('sway')
    expect(p.eyes).toBe('ring')
    expect(p.mouth).toBe('o')
  })

  it('복사 축하: 반달 눈·벌린 입, 편지가 떠오르고 한 번 폴짝', () => {
    const p = drawPlan(look({ face: 'happy', props: ['envelope'], cue: 'hop', cueSeq: 3 }), moving)
    expect(p).toMatchObject({ eyes: 'arc', mouth: 'open', floatProps: true, cue: 'hop', props: ['envelope'] })
  })

  it('걱정: 눈썹을 그린다', () => {
    const p = drawPlan(look({ face: 'worried', props: ['alert'] }), moving)
    expect(p).toMatchObject({ brows: true, eyes: 'dot', mouth: 'frown', cheeks: false })
  })

  it('움직임 줄이기: 움직임·한 번 도는 움직임·깜빡임·소품 떠오르기를 모두 끈다', () => {
    const p = drawPlan(look({ pose: 'walk', props: ['envelope'], cue: 'hop', cueSeq: 1 }), still)
    expect(p).toMatchObject({ motion: 'none', cue: null, blink: false, floatProps: false })
    expect(drawPlan(look({ pose: 'held', face: 'surprised' }), still).motion).toBe('none')
    expect(drawPlan(look({ cue: 'land', cueSeq: 2 }), still).cue).toBe(null)
  })

  it('(Task 6 이월) 움직임 줄이기에서도 반응은 표정·소품으로 보인다(폴짝 없이 반달 눈·벌린 입·편지)', () => {
    const p = drawPlan(look({ face: 'happy', props: ['sunglasses', 'envelope'], cue: 'hop', cueSeq: 4 }), still)
    expect(p).toMatchObject({ cue: null, motion: 'none', floatProps: false, mouth: 'open', cheeks: true, props: ['sunglasses', 'envelope'] })
    // 선글라스를 써도 입이 바뀌어 보인다
    expect(p.mouth).not.toBe(drawPlan(look({ props: ['sunglasses'] }), still).mouth)
    const worried = drawPlan(look({ face: 'worried', props: ['alert'] }), still)
    expect(worried).toMatchObject({ brows: true, mouth: 'frown', props: ['alert'], cue: null })
  })

  it('표정 표(face → 눈·입·눈썹·볼)', () => {
    const table: Record<PetFace, [string, string, boolean, boolean]> = {
      normal: ['dot', 'smile', false, true],
      happy: ['arc', 'open', false, true],
      worried: ['dot', 'frown', true, false],
      surprised: ['ring', 'o', false, false],
      content: ['arc', 'small', false, true],
      asleep: ['line', 'none', false, false],
      up: ['dot', 'small', false, false]
    }
    for (const [face, [eyes, mouth, brows, cheeks]] of Object.entries(table) as [PetFace, [string, string, boolean, boolean]][]) {
      expect(drawPlan(look({ face }), moving), face).toMatchObject({ eyes, mouth, brows, cheeks })
      expect(FACE_PARTS[face], face).toEqual({ eyes, mouth, brows, cheeks })
    }
  })

  it('자세별 움직임: 가만히·앉기 숨쉬기, 걷기 통통, 들림 흔들림, 오르기·공중·졸기 없음', () => {
    const table: Record<PetPose, string> = { stand: 'breathe', sit: 'breathe', walk: 'walk', held: 'sway', climb: 'none', air: 'none', sleep: 'none' }
    for (const [pose, motion] of Object.entries(table) as [PetPose, string][]) {
      expect(drawPlan(look({ pose }), moving).motion, pose).toBe(motion)
    }
  })

  it('깜빡임은 가만히·걷기·앉기·오르기에서 뜬 눈(점·동그란 눈)일 때만', () => {
    for (const pose of ['stand', 'walk', 'sit', 'climb'] as const) {
      expect(drawPlan(look({ pose, face: 'normal' }), moving).blink, pose).toBe(true)
    }
    expect(drawPlan(look({ pose: 'climb', face: 'up' }), moving).blink).toBe(true)
    for (const pose of ['held', 'air', 'sleep'] as const) {
      expect(drawPlan(look({ pose, face: 'normal' }), moving).blink, pose).toBe(false)
    }
    // 반달로 감은 눈(앉아 쉬기·복사 축하)과 졸 때 감은 눈은 깜빡이지 않는다(시안: 감은 눈에는 깜빡임이 없다)
    expect(drawPlan(look({ pose: 'sit', face: 'content' }), moving).blink).toBe(false)
    expect(drawPlan(look({ face: 'happy' }), moving).blink).toBe(false)
    expect(drawPlan(look({ face: 'asleep' }), moving).blink).toBe(false)
  })

  it('볼은 둥근 몸에만: 좁은 몸(오르기·들림)에서는 볼이 외곽선 밖으로 나가므로 그리지 않는다', () => {
    for (const pose of ['stand', 'walk', 'air', 'sit', 'sleep'] as const) {
      expect(drawPlan(look({ pose, face: 'happy' }), moving).cheeks, pose).toBe(true)
    }
    for (const pose of ['climb', 'held'] as const) {
      expect(drawPlan(look({ pose, face: 'happy' }), moving).cheeks, pose).toBe(false)
      expect(drawPlan(look({ pose, face: 'normal' }), moving).cheeks, pose).toBe(false)
    }
  })

  it('소품은 선글라스 → 편지 → 느낌표 → z → 조종 표시 순서로 한 번씩', () => {
    const p = drawPlan(look({ props: ['control', 'zzz', 'alert', 'sunglasses', 'envelope', 'alert'] }), moving)
    expect(p.props).toEqual(['sunglasses', 'envelope', 'alert', 'zzz', 'control'])
  })

  it('오른쪽을 보면 뒤집지 않고, 한 번 도는 움직임이 없으면 cue는 null', () => {
    const p = drawPlan(look({ facing: 'right', cue: null, cueSeq: 5 }), moving)
    expect(p.mirror).toBe(false)
    expect(p.cue).toBe(null)
    expect(drawPlan(look({ cue: 'land', cueSeq: 6 }), moving).cue).toBe('land')
  })
})
