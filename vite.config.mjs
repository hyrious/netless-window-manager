import { defineConfig } from 'vite'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

export default defineConfig({
  define: { '__VERSION__': `"${pkg.version}"` }
})
