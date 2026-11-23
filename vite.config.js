import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // host: true → 같은 네트워크의 다른 PC에서 접속 가능 (백엔드는 프록시 경유라 로컬 전용 유지)
  // 모든 /api 요청은 Spring(8000)으로 간다. AI 상태(/api/ai/health)도 Spring이 AI 서버에 물어서 돌려준다
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': process.env.API_TARGET || 'http://127.0.0.1:8000',
    },
  },
})
