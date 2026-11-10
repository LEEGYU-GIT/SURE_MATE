/** #/onboarding 첫 실행 안내(설계 문서 §6). 단계 화면은 Task 12에서 채운다 */
export function Onboarding(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-surface-palette font-ui text-fg">
      <div className="h-10 shrink-0 px-4 text-small leading-10 text-fg-2 [-webkit-app-region:drag]">Sure-Mate 시작하기</div>
    </div>
  )
}
