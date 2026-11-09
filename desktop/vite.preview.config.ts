import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 개발 전용: 실제 화면을 일반 브라우저에서 그려 캡처한다. 설치 파일에는 넣지 않는다.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'preview-dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/renderer/preview.html') }
  }
})
