import { useEffect } from 'react'

// Task 6에서 팔레트 화면으로 바꾼다. 지금은 표시·숨김과 포커스 복귀 확인용.
function App(): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') window.sureMate.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-900/80 text-zinc-100">
      Sure-Mate 팔레트 뼈대 · Esc로 닫기
    </div>
  )
}

export default App
