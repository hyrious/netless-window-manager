import { nodeResolve } from '@rollup/plugin-node-resolve'
import { defineConfig } from 'rollup'
import esbuild from 'rollup-plugin-esbuild'
import fs from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

export default defineConfig({
  input: 'src/index.ts',
  plugins: [
    esbuild({ define: { '__VERSION__': `"${pkg.version}"` } }),
    nodeResolve(),
    {
      name: 'clean-dist',
      buildStart() {
        fs.rmSync('dist', { recursive: true, force: true })
      },
    },
    {
      name: 'css',
      async closeBundle() {
        const entryPoints = [{ out: 'dist/style', in: 'src/style.css' }]
        await build({ entryPoints, bundle: true, outdir: '.' })
      },
    }
  ],
  external: mapExternal(Object.keys({
    ...pkg.peerDependencies,
    ...pkg.dependencies,
  })),
  output: [
    { file: 'dist/index.js', format: 'cjs' },
    { file: 'dist/index.mjs', format: 'esm' },
  ],
})

function mapExternal(names) {
  return names.concat(names.map(name => new RegExp('^' + name + '/')))
}
