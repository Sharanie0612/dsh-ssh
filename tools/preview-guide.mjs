import { testRequire, browserExecutable } from '../tests/helpers/dependencies.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startMockUiServer } from '../tests/ui-smoke.mjs'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { chromium } = testRequire('playwright')
const server = await startMockUiServer()
const browser = await chromium.launch({ executablePath: browserExecutable, headless: true })
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 640, height: 660 } })
    await page.goto(`${server.origin}/?lang=zh&theme=${theme}`)
    await page.getByRole('button', { name: '新建 SSH 会话', exact: false }).waitFor()
    await page.screenshot({ path: join(root, `artifacts/guide-${theme}.png`) })
    await page.close()
  }
  console.log('Saved Chinese light/dark guide previews.')
} finally { await browser.close(); await server.close() }
