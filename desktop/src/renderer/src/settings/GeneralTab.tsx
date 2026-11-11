import type { PaletteDisplay } from '../../../shared/settings/settings'
import { Button, Row, Section, Segmented, Toggle } from './controls'
import { useSettingsCtx } from './use-settings'

const DISPLAY_OPTIONS: { value: PaletteDisplay; label: string }[] = [
  { value: 'cursor', label: '마우스 있는 모니터' },
  { value: 'active', label: '작업 중인 창' },
  { value: 'primary', label: '주 모니터' }
]

/** 일반: 팔레트를 띄울 곳, 로그인 시 자동 실행, 처음 안내 다시 보기, 설정 파일·기록 폴더 */
export function GeneralTab(): React.JSX.Element {
  const { snapshot, save } = useSettingsCtx()
  const s = snapshot.settings
  const api = window.sureMate.settings
  return (
    <>
      <Section title="팔레트">
        <Row label="팔레트를 띄울 곳" description="모니터가 여러 대일 때 팔레트가 뜨는 모니터예요">
          {(ids) => <Segmented {...ids} value={s.palette.display} options={DISPLAY_OPTIONS} onChange={(display) => void save({ palette: { display } })} />}
        </Row>
      </Section>
      <Section title="시작">
        <Row
          label="로그인할 때 자동으로 실행"
          description={snapshot.packaged ? 'Windows에 로그인하면 트레이에서 기다려요' : '개발 실행이라 저장만 하고, 설치한 앱에서 적용돼요'}
        >
          {(ids) => <Toggle {...ids} checked={s.launchAtLogin} onChange={(launchAtLogin) => void save({ launchAtLogin })} />}
        </Row>
        <Row label="처음 안내 다시 보기" description="단축키·주로 쓰는 AI·가명 처리를 다시 고르고, 회의록 정리를 따라 해 봐요">
          {() => <Button onClick={() => api.openOnboarding()}>안내 열기</Button>}
        </Row>
      </Section>
      <Section title="파일">
        <Row label="설정 파일" description="여기서 바꿀 수 없는 값을 손으로 고칠 때만 열어요. 고친 뒤에는 앱을 다시 시작해 주세요">
          {() => <Button onClick={() => api.openFile('settings')}>설정 파일 열기</Button>}
        </Row>
        <Row label="기록(로그)" description="문제를 알릴 때 보내 주세요. 선택한 글·프롬프트·클립보드 내용은 남지 않아요">
          {() => <Button onClick={() => api.openFile('logs')}>기록 폴더 열기</Button>}
        </Row>
      </Section>
    </>
  )
}
