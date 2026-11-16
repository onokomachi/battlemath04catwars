import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // ベンダーを分割し、アプリ更新時のキャッシュ効率と初回表示を改善
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
