import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** 지금 움직임 줄이기인지(Windows 애니메이션 효과 끔 = prefers-reduced-motion). 바뀌면 다시 그린다 */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia(QUERY).matches
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(QUERY)
    const on = (): void => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}
