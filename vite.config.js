import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // host: true → 같은 네트워크의 다른 PC에서 접속 가능 (백엔드는 프록시 경유라 로컬 전용 유지)
  // /api/ai → AI 서버(FastAPI 8080, 경로 /ai/v1), 나머지 /api → Spring(8000). /api/ai 규칙이 먼저 와야 한다
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/ai': {
        target: process.env.AI_TARGET || 'http://127.0.0.1:8080',
        rewrite: (p) => p.replace(/^\/api\/ai/, '/ai/v1'),
      },
      '/api': process.env.API_TARGET || 'http://127.0.0.1:8000',
    },
  },
})
