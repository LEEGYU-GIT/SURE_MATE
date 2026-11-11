import { useId, type SVGProps } from 'react'
import type { PaletteGroup } from '../../../shared/types'

// Lucide 아이콘 몇 개를 옮겨 왔다(ISC, 일부는 Feather MIT). 라이선스: resources/licenses/Lucide-LICENSE.txt(설치 파일에 함께 들어간다)
// 설계 문서 §14-4: 24 격자, 선 굵기 1.8, 둥근 끝

/** badge: 오른쪽 위 상태 점의 색(예: 'var(--brand)') */
type IconProps = { size?: number; className?: string; badge?: string }

/**
 * 상태 점(24 격자). 점 둘레를 --ink 고리로 칠해 아이콘 선과 떼어 놓는다.
 * 어두운 바 위에서는 고리가 바탕과 같아 보여 잘라 낸 틈처럼 보이고, 밝은 화면 위에서는 점의 윤곽이 된다(말랑 메이트의 --ink 외곽선과 같은 원리).
 */
const BADGE = { cx: 19.25, cy: 4.75, r: 3.25, ring: 1.5 }

function Badge({ color }: { color: string }): React.JSX.Element {
  return <circle cx={BADGE.cx} cy={BADGE.cy} r={BADGE.r} strokeWidth={BADGE.ring * 2} style={{ fill: color, stroke: 'var(--ink)', paintOrder: 'stroke' }} />
}

function Svg({ size = 16, className, badge, children }: IconProps & { children: SVGProps<SVGSVGElement>['children'] }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
      {badge ? <Badge color={badge} /> : null}
    </svg>
  )
}

export const SearchIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
)

export const PromptIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
)

export const CommandIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" x2="20" y1="19" y2="19" />
  </Svg>
)

export const WorkspaceIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </Svg>
)

export const SnippetIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </Svg>
)

export const WikiIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </Svg>
)

export const ShieldIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </Svg>
)

export const ShieldOffIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18" />
    <path d="M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38" />
    <path d="m2 2 20 20" />
  </Svg>
)

export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const NotebookPenIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
    <path d="M2 6h4" />
    <path d="M2 10h4" />
    <path d="M2 14h4" />
    <path d="M2 18h4" />
    <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
  </Svg>
)

export const ListChecksIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M13 5h8" />
    <path d="M13 12h8" />
    <path d="M13 19h8" />
    <path d="m3 17 2 2 4-4" />
    <path d="m3 7 2 2 4-4" />
  </Svg>
)

export const ScanSearchIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
    <path d="m16 16-1.9-1.9" />
  </Svg>
)

/** 펼침 메뉴에서 지금 고른 값 표시 */
export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
)

export const EyeOffIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </Svg>
)

/** 말랑 메이트 조종하기(게임 패드: 키보드로 움직이며 노는 일) */
export const GamepadIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <line x1="6" x2="10" y1="11" y2="11" />
    <line x1="8" x2="8" y1="9" y2="13" />
    <line x1="15" x2="15.01" y1="12" y2="12" />
    <line x1="18" x2="18.01" y1="10" y2="10" />
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
  </Svg>
)

/** 말랑 메이트 재우기 */
export const MoonIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
  </Svg>
)

/** 말랑 메이트 깨우기 */
export const SunIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </Svg>
)

/** 팔레트 빈 화면의 사용 팁 */
export const LightbulbIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </Svg>
)

export const PlusIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
)

/** 위키 카드 고정 */
export const PinIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </Svg>
)

/** 닫기 */
export const XIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
)

/** 설명 복사 */
export const CopyIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Svg>
)

/** ‹ 목록 */
export const ChevronLeftIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
)

/** 목록 행: 누르면 상세 */
export const ChevronRightIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
)

/** 클립보드 글로 찾기 */
export const ClipboardPasteIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M11 14h10" />
    <path d="M16 4h2a2 2 0 0 1 2 2v1.344" />
    <path d="m17 18 4-4-4-4" />
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </Svg>
)

/** 팔레트에서 열기(더 큰 창에서 보기) */
export const OpenOutIcon = (p: IconProps): React.JSX.Element => (
  <Svg {...p}>
    <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
    <path d="m21 3-9 9" />
    <path d="M15 3h6v6" />
  </Svg>
)

/**
 * 이름 첫 글자 칸(Lucide에 맞는 아이콘이 없는 고정 프롬프트). 둥근 네모 테두리는 다른 아이콘과 같은 선 굵기로 그리고,
 * 글자는 SVG가 아니라 글자 크기 토큰(letterClassName)으로 그려 작은 아이콘에서도 12px 아래로 줄지 않게 한다.
 */
export function LetterIcon({ letter, size = 16, className = '', letterClassName = '' }: IconProps & { letter: string; letterClassName?: string }): React.JSX.Element {
  return (
    <span className={`inline-grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }}>
      <Svg size={size} className="col-start-1 row-start-1">
        <rect width="20" height="20" x="2" y="2" rx="5" />
      </Svg>
      <span aria-hidden="true" className={`col-start-1 row-start-1 leading-none font-semibold ${letterClassName}`}>
        {letter}
      </span>
    </span>
  )
}

/** 말랑 메이트 젤리 몸(시안 docs/design/mallang-mate.html의 경로, 64 격자) */
const JELLY_BODY = 'M8 52 C8 30 18 16 32 16 C46 16 56 30 56 52 C56 57 50 58 32 58 C14 58 8 57 8 52 Z'
/** 64 격자에서 24 격자 선 굵기 1.8에 해당하는 굵기 */
const PET_STROKE = 1.8 * (64 / 24)
/** 끔 사선(Lucide 끔 아이콘의 m2 2 20 20을 64 격자로)과 사선 양옆 틈(24 격자 1.5) */
const PET_SLASH = 'M5.33 5.33 58.67 58.67'
const PET_SLASH_GAP = 1.5 * (64 / 24)

/**
 * 말랑 메이트 보이기·숨기기 아이콘. 몸이 아래쪽(y 16~58)에 있어 5만큼 올려 다른 아이콘과 가운데를 맞춘다.
 * off면 눈을 빼고 몸을 흐리게 한 뒤 사선을 긋는다. 사선은 흐리게 하지 않는다(상태를 알리는 선이라 대비를 지킨다).
 * 사선 양옆의 몸 윤곽은 마스크로 잘라 사선과 떼어 놓는다(Lucide 끔 아이콘과 같은 모양).
 */
export function PetIcon({ size = 16, className, off = false }: IconProps & { off?: boolean }): React.JSX.Element {
  const maskId = `pet-off-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={PET_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {off ? (
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="white" stroke="none" />
          <path d={PET_SLASH} stroke="black" strokeWidth={PET_STROKE + 2 * PET_SLASH_GAP} />
        </mask>
      ) : null}
      <g mask={off ? `url(#${maskId})` : undefined} opacity={off ? 0.5 : undefined}>
        <g transform="translate(0 -5)">
          <path d={JELLY_BODY} />
          {off ? null : (
            <>
              <ellipse cx="25.5" cy="38" rx="3.6" ry="4.8" fill="currentColor" stroke="none" />
              <ellipse cx="38.5" cy="38" rx="3.6" ry="4.8" fill="currentColor" stroke="none" />
            </>
          )}
        </g>
      </g>
      {off ? <path d={PET_SLASH} /> : null}
    </svg>
  )
}

const GROUP_ICONS: Record<PaletteGroup, (p: IconProps) => React.JSX.Element> = {
  prompt: PromptIcon,
  command: CommandIcon,
  workspace: WorkspaceIcon,
  snippet: SnippetIcon,
  wiki: WikiIcon
}

export function GroupIcon({ group, ...p }: IconProps & { group: PaletteGroup }): React.JSX.Element {
  const Icon = GROUP_ICONS[group]
  return <Icon {...p} />
}
