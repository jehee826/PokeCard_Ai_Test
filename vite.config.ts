import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok 주소를 허용 목록에 추가합니다.
    allowedHosts: true
  }
})
