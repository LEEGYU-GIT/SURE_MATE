/** 시안의 가짜 바탕화면(미리 보기 전용이라 토큰 밖 색을 쓴다). 640×600, 아래 26px 작업 표시줄. */
export function Desktop({ edge, children }: { edge: 'left' | 'right'; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        width: 640,
        height: 600,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #22355E 0%, #3B4F86 55%, #6A5B9A 100%)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 26,
          background: 'rgba(15, 18, 28, 0.85)'
        }}
      />
      <div
        data-edge={edge}
        style={{ position: 'absolute', top: 0, bottom: 26, [edge]: 0, display: 'flex', alignItems: 'center' }}
      >
        {children}
      </div>
    </div>
  )
}
