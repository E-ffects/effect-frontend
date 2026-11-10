import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // host: true → 같은 네트워크의 다른 PC에서 접속 가능 (백엔드는 프록시 경유라 로컬 전용 유지)
  server: { host: true, port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
})
