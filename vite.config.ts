import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds a single, self-contained IIFE bundle (`dist/s7-voice-widget.js`) that
// includes React, React-DOM, and the ElevenLabs SDKs. The host page needs
// nothing pre-installed — just one <script> tag.
export default defineConfig({
  plugins: [react()],
  define: {
    // React reads this; without it the dev build ships and warns in console.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: 'src/embed.tsx',
      name: 'S7VoiceWidget',
      formats: ['iife'],
      fileName: () => 's7-voice-widget.js',
    },
    rollupOptions: {
      output: {
        // Required for an IIFE single-file bundle: the widget dynamically
        // imports @elevenlabs/client, which must be inlined rather than split.
        inlineDynamicImports: true,
      },
    },
  },
})
