import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as sshPlugin from '../../lib/index.js'

// Resolve the complete installed DSH runtime, keeping every service in one
// module graph. This test does not read or modify the user's credential store.
export async function startLiveServer({ handlePage, nativeWorkspaces = false, mountSsh = true } = {}) {
  const anchor = process.env.DSH_TEST_ANCHOR ?? join(homedir(), '.dsh', 'profiles', 'package.json')
  const require = createRequire(anchor)
  const runtime = process.env.DSH_TEST_RUNTIME ?? fileURLToPath(new URL('../../artifacts/runtime/dsh/node_modules/', import.meta.url))
  // The Desktop source extraction omits third-party packages. Use the already
  // installed profile only for those dependencies; DSH services all come from
  // the Desktop version, rather than an older profile's cached DSH packages.
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || specifier.startsWith('.') || specifier.startsWith('node:')) throw error
      return nextResolve(pathToFileURL(require.resolve(specifier)).href, context)
    }
  } })
  const load = async name => import(pathToFileURL(join(runtime, '@deepseek-ai', name, 'lib/index.js')).href)
  const [cordis, prompt, tools, credentials, web, connection, subprocess, agents, storage, storageJson, storageDomain] = await Promise.all([
    'cordis', 'dsh-system-prompt', 'dsh-tools', 'dsh-credentials-local',
    'dsh-host-webserver', 'dsh-client-connection', 'dsh-subprocess-local',
    'dsh-agent', 'dsh-storage', 'dsh-storage-json', 'dsh-storage-domain',
  ].map(load))
  const home = await mkdtemp(join(tmpdir(), 'dsh-ssh-runtime-'))
  const ctx = new cordis.Context()
  const errors = []
  let sessionVersion
  ctx.on('internal/error', error => errors.push(error))
  try {
    await ctx.plugin(credentials.default, { dshHome: home, watch: false })
    await ctx.plugin(storage.default)
    await ctx.plugin(storageJson, { root: join(home, 'storage') })
    await ctx.plugin(storageDomain, { backend: 'json' })
    if (nativeWorkspaces) {
      const [persistence, workspace, session] = await Promise.all(['dsh-session-persistence-jsonl', 'dsh-workspace', 'dsh-session'].map(load))
      sessionVersion = session.SESSION_FORMAT_VERSION
      await ctx.plugin(persistence.default, { root: join(home, 'sessions'), compression: 'none' })
      await ctx.plugin(workspace.default)
    }
    await ctx.plugin(agents.default)
    await ctx.plugin(prompt.default, {})
    await ctx.plugin(tools.default, {})
    await ctx.plugin(subprocess.default)
    await ctx.plugin(web.default, { host: '127.0.0.1', port: 0, compression: 'none' })
    await ctx.plugin(connection, {})
    const sshFiber = mountSsh ? await ctx.plugin({ ...sshPlugin, apply: ctx => sshPlugin.apply(ctx, { workspaceRoot: join(home, 'projects') }) }) : null
    if (errors.length) throw new AggregateError(errors, 'DSH test runtime failed to start')
    if (!ctx.connection || !ctx.webServer?.port || (mountSsh && !ctx.tools.get('ssh_exec'))) {
      throw new Error('DSH SSH plugin services did not activate')
    }
    if (handlePage) ctx.webServer.registerFallback((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname
      if (pathname === '/' && !ctx.connection.authorizeIndex(req, res)) return
      if (pathname.startsWith('/__ssh_ui__/session/') || pathname.startsWith('/__ssh_ui__/workspace/')) {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection !== undefined) { res.writeHead(rejection); res.end(); return }
      }
      return handlePage(req, res)
    })
    else ctx.webServer.registerFallback((req, res) => {
      if (!ctx.connection.authorizeIndex(req, res)) return
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('DSH SSH integration test')
    })
    const origin = `http://127.0.0.1:${ctx.webServer.port}`
    return {
      ctx, origin, sessionVersion, authenticatedUrl: ctx.connection.authenticatedUrl(`${origin}/`),
      reload: () => sshFiber.restart(),
      async close() {
        await ctx.fiber.dispose()
        hooks.deregister()
        await rm(home, { recursive: true, force: true })
        if (errors.length) throw new AggregateError(errors, 'DSH test runtime errors')
      },
    }
  } catch (error) {
    await ctx.fiber.dispose().catch(() => {})
    hooks.deregister()
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
