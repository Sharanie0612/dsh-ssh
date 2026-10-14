/**
 * The plugin's browser-facing API.
 *
 * The panel cannot call the HTTP route table directly: the desktop GUI serves the
 * page from its own application scheme and carries `/api` over an IPC bridge, so
 * only the harness's shared `/api` fetch handler is reachable from the page. This
 * module therefore registers **exact Fetch routes** on that handler through
 * `ctx.connection.fetch`, each path resolved before the shared channel's RPC
 * interceptor is consulted.
 *
 * Admission is the carrier's: the shared `/api` route applies the harness
 * browser-request trust check (loopback/trusted `Host`, same-origin `Origin`, and
 * a valid browser session) before any route here runs, so an unauthenticated
 * request is refused with 401 rather than dispatched. A request that reaches a
 * handler below has already been admitted as the operator.
 *
 * Registering through `ctx.connection` rather than `ctx.webServer` is what makes
 * the panel work in both carriers: in `dsh web` the same shared handler is the
 * one behind the `/api` route, so one registration serves both.
 * @module @local/dsh-ssh/api
 */
import { listConfiguredHosts } from './hosts.js'
import { contextKey } from './session.js'
import { listRemote, probeHost, readRemoteBytes, readRemoteFile, runRemote, writeRemoteBytes, writeRemoteFile } from './ssh.js'
import { createHash } from 'node:crypto'

/** The channel every route this plugin owns sits under. */
const CHANNEL = '/api'
/** The plugin's path prefix inside the channel; each later segment is the endpoint. */
export const API_PREFIX = '/api/ssh'

/** Answer with JSON, matching the shape the panel's failure path expects. */
function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}

/** Answer a failure a UI can display without guessing. */
function fail(status, reason) {
  return json({ ok: false, reason: String(reason) }, status)
}

/** Require a non-empty string field of a JSON body. */
function requireString(body, field) {
  const value = body?.[field]
  if (typeof value !== 'string' || value === '') throw new Error(`${field} is required`)
  return value
}

/** Text payloads may be empty, for example when saving an empty file. */
function requireText(body, field) {
  if (typeof body?.[field] !== 'string') throw new Error(`${field} must be a string`)
  return body[field]
}

function positiveInteger(value, fallback, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${field} must be an integer between 1 and ${maximum}`)
  }
  return value
}

/** Parse a JSON request body, reporting a malformed one as a client error. */
async function readJson(request) {
  try {
    const parsed = await request.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('request body must be a JSON object')
    return parsed
  } catch (error) {
    throw new Error(`invalid JSON body: ${error?.message ?? error}`)
  }
}

/**
 * Register the plugin's fetch routes on the shared `/api` handler.
 *
 * The browser uses plain fetch POSTs with JSON bodies. The shared handler
 * dispatches these exact routes before consulting the channel's RPC interceptor.
 * @param ctx - a context that has `connection`; `ctx.effect` owns the registrations.
 * @param settings - resolved plugin settings.
 * @param terminalsOf - reads the terminal service, or null when this composition has no subprocess provider.
 * @returns a disposer removing every route.
 */
export function registerApi(ctx, settings, terminalsOf = () => null, workspacesOf = () => null, projectsOf = () => null, contextsOf = () => null) {
  const sshOptions = {
    sshExecutable: settings.sshExecutable,
    connectTimeoutSeconds: settings.connectTimeoutSeconds,
    maxOutputBytes: settings.maxOutputBytes,
  }
  /** The terminal service, or a reason the panel can show. */
  const terminals = () => {
    const service = terminalsOf()
    if (service === null || service === undefined) {
      throw new Error('interactive terminals are unavailable: this composition has no subprocess provider')
    }
    return service
  }
  const disposers = []
  const route = (endpoint, methods, fetch) => {
    disposers.push(ctx.effect(() => ctx.connection.fetch.register({
      path: `${API_PREFIX}${endpoint}`,
      methods,
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          return await fetch(request)
        } catch (error) {
          return fail(400, error?.message ?? error)
        }
      },
    }), `dsh-ssh: ${methods.join('/')} ${API_PREFIX}${endpoint}`))
  }

  route('/hosts', ['POST'], async () => {
    const { path, hosts } = await listConfiguredHosts()
    return json({ ok: true, configPath: path, hosts })
  })

  route('/projects/create', ['POST'], async (request) => {
    const body = await readJson(request)
    const service = projectsOf()
    if (!service) return fail(503, 'SSH workspaces are unavailable')
    return json({ ok: true, ...await service.create({ host: requireString(body, 'host'), cwd: requireString(body, 'cwd'), title: body.title, signal: request.signal }) })
  })

  route('/workspace/get', ['POST'], async (request) => {
    const body = await readJson(request)
    const service = workspacesOf()
    if (!service) return fail(503, 'SSH conversations are unavailable: this composition has no Agent service')
    return json({ ok: true, ...service.get(requireString(body, 'session_id')) })
  })
  route('/workspace/select', ['POST'], async (request) => {
    const body = await readJson(request)
    const service = workspacesOf()
    if (!service) return fail(503, 'SSH conversations are unavailable: this composition has no Agent service')
    const result = await service.select({
      sessionId: requireString(body, 'session_id'), host: requireString(body, 'host'),
      cwd: requireString(body, 'cwd'), file: body.file === undefined ? null : body.file,
      signal: request.signal,
    })
    return json({ ok: true, ...result })
  })

  route('/probe', ['POST'], async (request) => {
    const body = await readJson(request)
    const probe = await probeHost(requireString(body, 'host'), { ...sshOptions, signal: request.signal })
    return json({ ok: true, probe })
  })

  route('/exec', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await runRemote({
      ...sshOptions,
      host: requireString(body, 'host'),
      command: requireString(body, 'command'),
      cwd: typeof body.cwd === 'string' && body.cwd !== '' ? body.cwd : undefined,
      timeoutMs: positiveInteger(body.timeout_ms, settings.defaultTimeoutMs, 'timeout_ms', 600000),
      signal: request.signal,
    })
    return json({ ok: true, result })
  })

  route('/ls', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await listRemote(
      requireString(body, 'host'),
      typeof body.path === 'string' && body.path !== '' ? body.path : '~',
      { ...sshOptions, signal: request.signal },
    )
    return json(result, result.ok === true ? 200 : 400)
  })

  route('/file', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await readRemoteFile(requireString(body, 'host'), requireString(body, 'path'), {
      ...sshOptions,
      offset: positiveInteger(body.offset, 1, 'offset'),
      limit: positiveInteger(body.limit, 2000, 'limit', 100000),
      signal: request.signal,
    })
    return json(result, result.ok === true ? 200 : 400)
  })

  route('/write', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await writeRemoteFile(
      requireString(body, 'host'),
      requireString(body, 'path'),
      requireText(body, 'content'),
      { ...sshOptions, signal: request.signal },
    )
    return json(result, result.ok === true ? 200 : 400)
  })

  route('/file/bytes', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await readRemoteBytes(requireString(body, 'host'), requireString(body, 'path'), {
      ...sshOptions,
      maxBytes: settings.maxTransferBytes,
      timeoutMs: settings.transferTimeoutMs,
      signal: request.signal,
    })
    if (result.ok !== true) return json(result, 400)
    return json({
      ok: true,
      host: result.host,
      path: result.path,
      size: result.size,
      sha256: createHash('sha256').update(result.bytes).digest('hex'),
      base64: result.bytes.toString('base64'),
    })
  })

  route('/file/put', ['POST'], async (request) => {
    const body = await readJson(request)
    const encoded = requireText(body, 'content_base64')
    if (encoded.length > Math.ceil(settings.maxTransferBytes / 3) * 4) {
      return fail(400, 'the payload exceeds the transfer limit')
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      return fail(400, 'content_base64 must be valid padded base64')
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded) return fail(400, 'content_base64 must be canonical base64')
    if (bytes.length > settings.maxTransferBytes) {
      return fail(400, `the payload is ${bytes.length} bytes, above the ${settings.maxTransferBytes}-byte transfer limit`)
    }
    const result = await writeRemoteBytes(requireString(body, 'host'), requireString(body, 'path'), bytes, {
      ...sshOptions,
      verifySha256: true,
      localSha256: createHash('sha256').update(bytes).digest('hex'),
      timeoutMs: settings.transferTimeoutMs,
      signal: request.signal,
    })
    return json(result, result.ok === true ? 200 : 400)
  })

  route('/branches', ['POST'], async (request) => {
    const body = await readJson(request)
    const contexts = contextsOf()
    // When no host is given, fall back to the session's default host (set by
    // ssh_connect). This is what the conversation-header branch selector uses.
    const context = contexts?.get?.(contextKey(undefined))
    const host = typeof body.host === 'string' && body.host !== '' ? body.host : context?.host
    if (!host) return json({ ok: true, branches: [], host: null })
    const cwd = typeof body.cwd === 'string' && body.cwd !== '' ? body.cwd : context?.cwd
    const result = await runRemote({
      ...sshOptions,
      host,
      command: 'git branch --format="%(refname:short)" 2>/dev/null || echo ""',
      cwd,
      timeoutMs: 15000,
      maxOutputBytes: 32768,
    })
    if (result.exitCode !== 0) return json({ ok: false, reason: result.stderr.trim() || `exit code ${result.exitCode}` }, 400)
    const branches = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    return json({ ok: true, branches, host, branch: context?.branch ?? null })
  })

  route('/term/open', ['POST'], async (request) => {
    const body = await readJson(request)
    const term = await terminals().open({ host: requireString(body, 'host'), cols: body.cols, rows: body.rows })
    return json({ ok: true, term })
  })

  route('/term/read', ['POST'], async (request) => {
    const body = await readJson(request)
    const result = await terminals().read({
      id: requireString(body, 'id'),
      since: Number.isInteger(body.since) ? body.since : 0,
      holdMs: Number.isInteger(body.hold_ms) ? body.hold_ms : undefined,
      signal: request.signal,
    })
    return json({ ok: true, ...result })
  })

  route('/term/write', ['POST'], async (request) => {
    const body = await readJson(request)
    await terminals().write(requireString(body, 'id'), typeof body.data === 'string' ? body.data : '')
    return json({ ok: true })
  })

  route('/term/resize', ['POST'], async (request) => {
    const body = await readJson(request)
    const term = await terminals().resize(requireString(body, 'id'), body.cols, body.rows)
    return json({ ok: true, term })
  })

  route('/term/close', ['POST'], async (request) => {
    const body = await readJson(request)
    await terminals().close(requireString(body, 'id'))
    return json({ ok: true })
  })

  route('/term/list', ['POST'], async () => json({ ok: true, sessions: terminals().list() }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** The path the panel prefixes every call with, exported for the client half's documentation. */
export const CLIENT_CHANNEL = CHANNEL
