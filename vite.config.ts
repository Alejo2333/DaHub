import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
export default defineConfig({plugins:[react(),tailwind()],build:{chunkSizeWarningLimit:1500,rollupOptions:{output:{manualChunks:{phaser:['phaser']}}}}})
