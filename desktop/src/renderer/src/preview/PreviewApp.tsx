import { SCENES } from './scenes'
import { createFakeApi } from './fake-api'

/** location.hash 의 장면 하나를 그린다. 그리기 전에 가짜 window.sureMate 를 설치한다. */
export function PreviewApp(): React.JSX.Element {
  const id = window.location.hash.replace(/^#/, '')
  const scene = SCENES.find((s) => s.id === id)
  if (!scene) {
    return (
      <ul style={{ padding: 16, color: 'var(--text-1)' }}>
        {SCENES.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={() => setTimeout(() => location.reload())} style={{ color: 'var(--brand)' }}>
              {s.id}
            </a>{' '}
            {s.title}
          </li>
        ))}
      </ul>
    )
  }
  window.sureMate = createFakeApi(scene.fixtures)
  return scene.render()
}
