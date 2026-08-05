import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The build produces a single self-contained HTML file (dist/index.html) with
// all JS/CSS inlined, so it can be uploaded as-is to SAS Content and served
// through the Job Execution web app. HTTPS is only needed for local dev,
// because SAS Visual Analytics will not embed http:// content in a DDC object.
export default defineConfig(({ command }) => ({
  server: {
    host: 'localhost',
    port: 3000,
  },
  plugins: [react(), ...(command === 'serve' ? [basicSsl()] : []), viteSingleFile()],
}))
