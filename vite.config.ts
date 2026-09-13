/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ViteMcp } from 'vite-plugin-mcp'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), ViteMcp()],
  define: {
    'import.meta.env.BMS_SESSION_ID': JSON.stringify(process.env.BMS_SESSION_ID || ''),
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      // API ของโมดูลนี้อยู่บน Express พอร์ต 5174 — เรียกด้วย path เดียวกับหน้าเว็บ
      // ('/api/...') ทั้งตอน dev และตอน deploy (nginx proxy ให้เหมือนกัน)
      // ส่วน BMS Session API เรียกด้วย URL เต็มจาก session จึงไม่ผ่าน proxy นี้
      '/api': {
        target: 'http://127.0.0.1:5174',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/component/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'tests/api/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/components/ui/**',
        'server/src/index.ts',
        // ไฟล์ที่มีแต่ประกาศชนิดข้อมูล — คอมไพล์แล้วไม่เหลือโค้ดให้ทดสอบ
        'src/types/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
