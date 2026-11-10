/** #/settings 설정 창(설계 문서 §14). 탭 화면은 Task 7부터 채운다 */
export function SettingsApp(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-surface-palette font-ui text-fg">
      <div className="h-10 shrink-0 px-4 text-small leading-10 text-fg-2 [-webkit-app-region:drag]">Sure-Mate 설정</div>
    </div>
  )
}
