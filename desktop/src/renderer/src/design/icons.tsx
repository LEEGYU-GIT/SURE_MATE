import type { SVGProps } from 'react'
import type { PaletteGroup } from '../../../shared/types'

// Lucide 아이콘 몇 개를 옮겨 왔다(ISC, 일부는 Feather MIT). 라이선스: resources/licenses/Lucide-LICENSE.txt(설치 파일에 함께 들어간다)
// 설계 문서 §14-4: 24 격자, 선 굵기 1.8, 둥근 끝

type IconProps = { size?: number; className?: string }

function Svg({ size = 16, className, children }: IconProps & { children: SVGProps<SVGSVGElement>['children'] }): React.JSX.Element {
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
