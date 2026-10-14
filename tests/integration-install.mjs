import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { startLiveServer } from './helpers/live-server.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = JSON.parse(await readFile(join(root, 'releases/latest.json'), 'utf8'))
const tarball = resolve(root, 'releases', release.filename)
const pnpm = process.env.DSH_TEST_PNPM ?? join(homedir(), '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs')
const profile = await mkdtemp(join(tmpdir(), 'dsh-ssh-offline-install-'))
const packagePath = join(profile, 'package.json')
let server
try {
  await writeFile(packagePath, JSON.stringify({ name: 'offline-install-test', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }))
  server = await startLiveServer({ mountSsh: false })
  const managerModule = await import(new URL('../artifacts/runtime/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js', import.meta.url))
  assert.equal(managerModule.parseInstallSpec(tarball).kind, 'tarball')
  const profileContext = {
    name: 'offline-test', dir: profile, home: profile, cwd: root, installAnchor: packagePath, startedBundles: [],
    packageManager: { command: process.execPath, args: [pnpm], env: {
      npm_config_offline: 'true', npm_config_store_dir: join(profile, 'empty-store'), npm_config_registry: 'http://127.0.0.1:9/',
    } },
  }
  await server.ctx.plugin({ apply: ctx => {
    ctx.reflect.provide('loader', { entries: () => [] })
    ctx.reflect.provide('profileContext', profileContext)
  } })
  await server.ctx.plugin(managerModule.default, { registry: 'http://127.0.0.1:9/', fallbackRegistries: [], idleTimeoutMs: 30000 })
  const result = await server.ctx.pluginManager.installBundle(tarball)
  assert.notEqual(result.application, 'failed', JSON.stringify(result))
  assert.equal(result.bundle, release.name)
  assert.equal(result.packageResult.exitCode, 0)
  const installed = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.ok(installed.dsh.profile.bundles.includes(release.name))
  const require = createRequire(packagePath)
  const installedPackage = JSON.parse(await readFile(require.resolve(release.name + '/package.json'), 'utf8'))
  assert.equal(installedPackage.version, release.version)
  for (const filename of ['./client', './cordis.patch.yml']) assert.ok(require.resolve(release.name + '/' + filename.slice(2)))
  console.log('PASS real DSH PluginManager installs and enables the local tarball in a fresh profile with an empty store and networking disabled')
  const packedModule = await import(pathToFileURL(require.resolve(release.name)).href)
  await server.ctx.plugin(packedModule)
  assert.ok(server.ctx.tools.get('ssh_exec'))
  assert.ok(server.ctx.tools.get('ssh_read'))
  console.log('PASS the installed package activates its real host tools without the development checkout')
} finally {
  await server?.close()
  await rm(profile, { recursive: true, force: true })
}
process.exit(0)
