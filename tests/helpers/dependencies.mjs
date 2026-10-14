import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const anchors = [
  new URL('../../package.json', import.meta.url),
  process.env.DSH_TEST_ANCHOR ?? join(homedir(), '.dsh', 'profiles', 'package.json'),
  join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'package.json'),
]
const resolvers = anchors.map(anchor => createRequire(anchor))
function resolve(name) {
  for (const require of resolvers) {
    try { return require.resolve(name) } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error }
  }
  throw new Error(`Missing test dependency ${name}; install the dependencies in docs/testing.md or set DSH_TEST_ANCHOR`)
}
export const testRequire = name => createRequire(new URL('../../package.json', import.meta.url))(resolve(name))
testRequire.resolve = resolve
export const browserExecutable = process.env.DSH_TEST_BROWSER ?? (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')
