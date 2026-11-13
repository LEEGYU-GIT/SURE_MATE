import { describe, expect, it } from 'vitest'
import { PET_LIMITS } from '../pet/pet-settings'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { applySettingsPatch, SETTINGS_LIMITS, validateSettingsPatch } from './settings-patch'

const cur = (): Settings => structuredClone(DEFAULT_SETTINGS)
const errorsOf = (raw: unknown, s: Settings = cur()): string[] => {
  const r = validateSettingsPatch(raw, s)
  return r.ok ? [] : r.errors
}
const patchOf = (raw: unknown, s: Settings = cur()) => {
  const r = validateSettingsPatch(raw, s)
  if (!r.ok) throw new Error(r.errors.join(' / '))
  return r.patch
}

describe('알 수 없는 키', () => {
  it('최상위·하위의 모르는 키는 이름을 들어 거절한다(단축키·버전은 이 길로 바꾸지 않는다)', () => {
    for (const k of ['hotkeys', 'version', 'foo']) expect(errorsOf({ [k]: 1 }).join()).toContain(k)
    expect(errorsOf({ masking: { color: 'red' } }).join()).toContain('masking.color')
    expect(errorsOf({ bar: { positions: [] } }).join()).toContain('bar.positions')
    expect(errorsOf({ pet: { character: 'cat' } }).join()).toContain('pet.character')
    expect(errorsOf(null).length).toBeGreaterThan(0)
    expect(errorsOf([]).length).toBeGreaterThan(0)
  })
})

describe('값의 종류와 범위', () => {
  it('정해진 값 밖이면 거절한다', () => {
    expect(errorsOf({ palette: { display: 'left' } })).not.toEqual([])
    expect(errorsOf({ masking: { mode: 'on' } })).not.toEqual([])
    expect(errorsOf({ launchAtLogin: 'yes' })).not.toEqual([])
    for (const ttl of [0, SETTINGS_LIMITS.ttlHours.max + 1, 1.5]) expect(errorsOf({ masking: { ttlHours: ttl } })).not.toEqual([])
    expect(errorsOf({ bar: { opacity: 0.5 } })).not.toEqual([])
    expect(errorsOf({ bar: { wikiCardWidth: 600 } })).not.toEqual([])
    expect(errorsOf({ bar: { wikiCardMs: 2000 } })).not.toEqual([])
    expect(errorsOf({ bar: { shape: 'round' } })).not.toEqual([])
    expect(errorsOf({ masking: { categories: { ip: 'off' } } })).not.toEqual([])
    expect(errorsOf({ masking: { categories: { money: false } } })).not.toEqual([])
  })

  it('고정 프롬프트는 5개까지, id는 64자까지(없는 템플릿인지는 화면이 보인다)', () => {
    expect(errorsOf({ bar: { pinnedPrompts: ['a', 'b', 'c', 'd', 'e', 'f'] } })).not.toEqual([])
    expect(errorsOf({ bar: { pinnedPrompts: ['x'.repeat(65)] } })).not.toEqual([])
    expect(patchOf({ bar: { pinnedPrompts: ['no-such-template'] } }).bar?.pinnedPrompts).toEqual(['no-such-template'])
  })
})

describe('사내 도메인', () => {
  it('앞뒤 공백을 떼고 소문자로, 겹치면 하나만', () => {
    expect(patchOf({ masking: { internalDomains: ['Example.COM ', 'example.com', 'intra.example.co.kr'] } }).masking?.internalDomains).toEqual([
      'example.com',
      'intra.example.co.kr'
    ])
  })
  it('주소·한 단어·빈 칸 이름·너무 많으면 거절', () => {
    for (const bad of ['http://a.com', 'a', 'a..com', 'a.com/path']) expect(errorsOf({ masking: { internalDomains: [bad] } }).join()).toContain(bad)
    const many = Array.from({ length: SETTINGS_LIMITS.internalDomains + 1 }, (_, i) => `d${i}.example.com`)
    expect(errorsOf({ masking: { internalDomains: many } })).not.toEqual([])
  })
})

describe('AI 대상', () => {
  const target = (o: Partial<{ id: string; name: string; url: string }> = {}) => ({ id: 'my-llm', name: '사내 LLM', url: 'https://llm.example.com', ...o })
  it('사용자 대상은 http/https 주소가 있어야 하고 이름·개수 제한, 기본 대상 id와 겹치면 거절', () => {
    expect(patchOf({ ai: { custom: [target()] } }).ai?.custom).toEqual([target()])
    for (const bad of [
      target({ name: 'x'.repeat(SETTINGS_LIMITS.targetName + 1) }),
      target({ url: 'file:///c:/x' }),
      target({ url: 'javascript:alert(1)' }),
      { id: 'my-llm', name: '주소 없음' },
      target({ id: 'claude' }),
      target({ name: '  ' })
    ])
      expect(errorsOf({ ai: { custom: [bad] } })).not.toEqual([])
    expect(errorsOf({ ai: { custom: [target(), target()] } })).not.toEqual([])
    const many = Array.from({ length: SETTINGS_LIMITS.customTargets + 1 }, (_, i) => target({ id: `t${i}` }))
    expect(errorsOf({ ai: { custom: many } })).not.toEqual([])
  })
  it('기본 대상은 같은 패치의 사용자 대상까지 더한 목록에 있어야 한다', () => {
    expect(errorsOf({ ai: { defaultTarget: 'my-llm' } })).not.toEqual([])
    expect(patchOf({ ai: { defaultTarget: 'my-llm', custom: [target()] } }).ai?.defaultTarget).toBe('my-llm')
    const withCustom = applySettingsPatch(cur(), patchOf({ ai: { custom: [target()] } }))
    expect(patchOf({ ai: { defaultTarget: 'my-llm' } }, withCustom).ai?.defaultTarget).toBe('my-llm')
    // 지금 기본 대상인 사용자 대상을 지우면 거절(기본 대상이 사라짐)
    const withDefault = applySettingsPatch(withCustom, patchOf({ ai: { defaultTarget: 'my-llm' } }, withCustom))
    expect(errorsOf({ ai: { custom: [] } }, withDefault)).not.toEqual([])
  })
})

describe('빼기 모드 표기', () => {
  it('빈 글·너무 긴 글·줄바꿈·중괄호는 거절하고, 앞뒤 공백은 뗀다', () => {
    expect(patchOf({ masking: { removeLabels: { client: ' 협력사 ', ip: '[주소]' } } }).masking?.removeLabels).toEqual({ client: '협력사', ip: '[주소]' })
    for (const bad of ['', ' ', 'x'.repeat(SETTINGS_LIMITS.removeLabel + 1), '줄\n바꿈', '{{a}}']) expect(errorsOf({ masking: { removeLabels: { client: bad } } })).not.toEqual([])
    expect(errorsOf({ masking: { removeLabels: { money: '돈' } } })).not.toEqual([])
  })
})

describe('말랑 메이트(pet, 설계 문서 §14)', () => {
  it('맞는 값은 필드마다 그대로 받는다', () => {
    const { min, max } = PET_LIMITS.sleepAfterMin
    const valid: [string, unknown][] = [
      ['visible', false],
      ['visible', true],
      ['size', 40],
      ['size', 56],
      ['size', 72],
      ['activity', 'calm'],
      ['activity', 'normal'],
      ['activity', 'lively'],
      ['sleepAfterMin', min],
      ['sleepAfterMin', 3],
      ['sleepAfterMin', max],
      ['bubbles', false],
      ['reactions', false],
      ['reduceMotion', true]
    ]
    for (const [k, v] of valid) expect(patchOf({ pet: { [k]: v } }).pet, `${k}=${String(v)}`).toEqual({ [k]: v })
  })

  it('틀린 값은 필드마다 까닭을 들어 거절하고, 범위 밖 숫자를 끝값으로 바꿔 받지 않는다', () => {
    const { max } = PET_LIMITS.sleepAfterMin
    const invalid: [string, unknown, string][] = [
      ['visible', 'yes', '보이기'],
      ['size', 64, '크기'],
      ['size', '56', '크기'],
      ['size', 0, '크기'],
      ['activity', 'fast', '활발함'],
      ['activity', '', '활발함'],
      ['sleepAfterMin', 0, '졸기'],
      ['sleepAfterMin', max + 1, '졸기'],
      ['sleepAfterMin', 2.5, '졸기'],
      ['sleepAfterMin', '3', '졸기'],
      ['sleepAfterMin', Number.NaN, '졸기'],
      ['sleepAfterMin', Number.POSITIVE_INFINITY, '졸기'],
      ['bubbles', 1, '말풍선'],
      ['reactions', null, '반응'],
      ['reduceMotion', 'on', '움직임 줄이기']
    ]
    for (const [k, v, word] of invalid) {
      const r = validateSettingsPatch({ pet: { [k]: v } }, cur())
      expect(r.ok, `${k}=${String(v)}`).toBe(false)
      if (!r.ok) expect(r.errors.join(' / '), `${k}=${String(v)}`).toContain(word)
    }
  })

  it('조종 단축키는 이 길로 바꾸지 않는다(등록해 보고 실패하면 되돌려야 하므로 단축키 바꾸기로)', () => {
    expect(errorsOf({ pet: { controlHotkey: 'Ctrl+Alt+P' } }).join()).toContain('단축키')
    expect(errorsOf({ pet: { controlHotkey: null } })).not.toEqual([])
  })

  it('형식이 틀리면 거절하고, 한 필드라도 틀리면 맞는 필드도 받지 않는다', () => {
    for (const bad of [1, null, [], 'pet']) expect(errorsOf({ pet: bad })).not.toEqual([])
    expect(validateSettingsPatch({ pet: { size: 72, sleepAfterMin: 0 } }, cur()).ok).toBe(false)
  })

  it('펫 패치는 보낸 펫 필드만 바꾸고 다른 설정(단축키·바·가명 처리)과 나머지 펫 필드는 그대로 둔다', () => {
    const s = cur()
    s.masking.mode = 'off'
    s.bar.opacity = 0.8
    s.hotkeys.palette = 'Alt+`'
    s.pet.controlHotkey = 'Ctrl+Alt+P'
    s.pet.activity = 'lively'
    const next = applySettingsPatch(s, patchOf({ pet: { size: 72, reduceMotion: true } }, s))
    expect(next.pet).toEqual({ ...s.pet, size: 72, reduceMotion: true })
    expect({ ...next, pet: s.pet }).toEqual(s)
    // 원래 객체는 바꾸지 않는다
    expect(s.pet.size).toBe(56)
  })
})

describe('applySettingsPatch', () => {
  it('보낸 필드만 바꾸고 나머지(다른 곳에서 바꾼 값 포함)는 그대로 둔다', () => {
    const s = cur()
    s.masking.mode = 'off'
    s.bar.positions = [{ display: '1', ratio: 0.3 }]
    s.hotkeys.palette = 'Alt+`'
    const next = applySettingsPatch(s, patchOf({ bar: { opacity: 0.8 }, masking: { categories: { ip: false } } }, s))
    expect(next.bar.opacity).toBe(0.8)
    expect(next.bar.positions).toEqual([{ display: '1', ratio: 0.3 }])
    expect(next.masking.mode).toBe('off')
    expect(next.masking.categories.ip).toBe(false)
    expect(next.masking.categories.email).toBe(true)
    expect(next.hotkeys.palette).toBe('Alt+`')
    // 원래 객체는 바꾸지 않는다
    expect(s.bar.opacity).toBe(1)
    expect(s.masking.categories.ip).toBe(true)
  })
  it('설정 창이 다른 필드를 모두 바꿔도 펫 설정(M6)은 하나도 바뀌지 않는다', () => {
    const s = cur()
    s.pet = { visible: false, size: 72, activity: 'lively', sleepAfterMin: 10, bubbles: false, reactions: false, controlHotkey: 'Ctrl+Alt+P', reduceMotion: true }
    const before = structuredClone(s.pet)
    const patch = patchOf(
      {
        palette: { display: 'primary' },
        launchAtLogin: false,
        onboardingDone: true,
        masking: { mode: 'off', categories: { ip: false }, internalDomains: ['intra.example.com'], ttlHours: 4, removeLabels: { client: '협력사' } },
        ai: { defaultTarget: 'chatgpt' },
        bar: { shape: 'capsule', opacity: 0.8, autoHide: true }
      },
      s
    )
    expect(applySettingsPatch(s, patch).pet).toEqual(before)
  })
  it('빼기 표기는 보낸 분류만 덮고 null이면 기본으로 돌린다', () => {
    const s = applySettingsPatch(cur(), patchOf({ masking: { removeLabels: { client: '협력사', ip: '[주소]' } } }))
    const next = applySettingsPatch(s, patchOf({ masking: { removeLabels: { client: null } } }, s))
    expect(next.masking.removeLabels).toEqual({ ip: '[주소]' })
  })
})

describe('처음 한 번 보이는 안내(tips, 2026-11-12): 확인 화면의 가명 처리 예시를 봤는지', () => {
  it('기본값은 아직 안 봄(false)', () => {
    expect(DEFAULT_SETTINGS.tips).toEqual({ maskingExampleSeen: false })
  })

  it('켬·끔 값만 받고, 보낸 필드만 바꾼다(다른 설정은 그대로)', () => {
    expect(patchOf({ tips: { maskingExampleSeen: true } })).toEqual({
      tips: { maskingExampleSeen: true }
    })
    const s = cur()
    s.masking.mode = 'remove'
    const next = applySettingsPatch(s, patchOf({ tips: { maskingExampleSeen: true } }, s))
    expect(next.tips).toEqual({ maskingExampleSeen: true })
    expect(next.masking.mode).toBe('remove')
    expect(s.tips.maskingExampleSeen).toBe(false)
    // 빈 tips는 아무것도 바꾸지 않는다
    expect(applySettingsPatch(next, patchOf({ tips: {} }, next)).tips).toEqual({
      maskingExampleSeen: true
    })
  })

  it('틀린 값·모르는 안내 이름·형식이 틀린 tips는 거절한다', () => {
    expect(errorsOf({ tips: { maskingExampleSeen: 'yes' } })).not.toEqual([])
    expect(errorsOf({ tips: { maskingExampleSeen: 1 } })).not.toEqual([])
    expect(errorsOf({ tips: { otherTip: true } }).join()).toContain('tips.otherTip')
    for (const bad of [true, 'seen', null, []])
      expect(errorsOf({ tips: bad }), String(bad)).not.toEqual([])
  })
})
