import '../scripts/polyfill-webcrypto.cjs'
import { build, mergeConfig } from 'vite'
import baseConfig from '../vite.config.js'
import { pathToFileURL, fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

async function main() {
  // polyfill already loaded by side-effect import above

  const mode = process.env.MODE || process.env.NODE_ENV || 'production'
  process.env.NODE_ENV = mode

  const resolvedBase =
    typeof baseConfig === 'function'
      ? await baseConfig({ command: 'build', mode, ssrBuild: false })
      : baseConfig

  const finalConfig = mergeConfig(resolvedBase, {
    mode,
    configFile: false
  })

  await build(finalConfig)

  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = dirname(currentFile)
  const copyScriptUrl = pathToFileURL(resolve(currentDir, 'copy-cesium-assets.js'))
  await import(copyScriptUrl)
}

main().catch((error) => {
  console.error('[build-with-polyfill] 构建失败:', error)
  process.exit(1)
})
