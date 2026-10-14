/**
 * The plugin's model-facing tools.
 *
 * A tool is built here as the plain object `ctx.tools.register` accepts, rather
 * than through `@deepseek-ai/dsh-tools`' `defineTool`, so the plugin imports
 * nothing from the harness installation and installs with no dependency
 * resolution of its own.
 *
 * Every tool takes the host alias as its first argument and is registered under
 * an `ssh_`-prefixed name. The shipped `read`, `write`, `edit`, `glob`, and
 * `grep` tools are the local filesystem's and keep their names: a remote
 * operation must be asked for explicitly, never shadow a local one.
 * @module @local/dsh-ssh/tools
 */
import {
  assertHostToken,
  globRemote,
  grepRemote,
  listRemote,
  probeHost,
  readRemoteBytes,
  readRemoteFile,
  runRemote,
  shellQuotePath,
  writeRemoteBytes,
  writeRemoteFile,
} from './ssh.js'
import { listConfiguredHosts } from './hosts.js'
import { contextKey, createRemoteContexts, resolveCwd, resolveHost, resolveRemotePath } from './session.js'
import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'

/** The largest whole file `ssh_edit` will rewrite in place. */
const EDIT_MAX_BYTES = 2 * 1024 * 1024

/** One text content block, the shape every tool result renderer returns. */
function text(value) {
  return [{ type: 'text', text: value }]
}

/** Two-column listing used by the host-facing tools. */
function bulletList(rows) {
  return rows.map((row) => `- ${row}`).join('\n')
}

/** The canonical `host` description every host-scoped tool shares. */
const HOST_DESCRIPTION = 'Host alias from ~/.ssh/config, or user@hostname. '
  + 'Omit it to use the session host selected by ssh_connect.'

/** The canonical `path` description every path-taking tool shares. */
const PATH_DESCRIPTION = 'Remote path. A relative path is resolved against the session directory '
  + 'set by ssh_connect; an absolute or ~ path is used as given.'

/**
 * Make a tool's `host` optional, preserving its required file path.
 *
 * One wrapper covers every host-scoped tool, so the requirement lives in exactly
 * one place and the tool bodies can keep reading `args.host` and `args.path` as if
 * they were required: the caller fills them in before the body runs.
 * @param parameters - the tool's parameter schema.
 * @returns the schema with `host` and `path` optional and described consistently.
 */
export function hostScopedSchema(parameters) {
  const properties = { ...(parameters.properties ?? {}) }
  if (properties.host !== undefined) properties.host = { ...properties.host, description: HOST_DESCRIPTION }
  if (properties.path !== undefined) properties.path = { ...properties.path, description: PATH_DESCRIPTION }
  return {
    ...parameters,
    properties,
    required: (parameters.required ?? []).filter((name) => name !== 'host'),
  }
}

/**
 * Register the SSH tool suite.
 * @param ctx - the plugin context; `ctx.tools` must be available.
 * @param settings - resolved plugin settings.
 * @returns the per-Agent remote contexts, so the caller can release them on unload.
 */
export function registerTools(ctx, settings, workspaceOf = () => undefined, forgetWorkspace = async () => {}) {
  const common = {
    sshExecutable: settings.sshExecutable,
    connectTimeoutSeconds: settings.connectTimeoutSeconds,
  }
  const contexts = createRemoteContexts(workspaceOf)

  /**
   * Register a host-scoped tool.
   *
   * The Agent's session context supplies a default host and working directory, so
   * a conversation can settle onto one board once and then stop repeating it. An
   * explicit argument always wins.
   */
  const registerHostTool = (definition) => {
    const execute = definition.execute
    ctx.tools.register({
      ...definition,
      parameters: hostScopedSchema(definition.parameters),
      async execute(args, exec) {
        const context = contexts.get(contextKey(exec?.agent))
        const resolved = resolveHost(args.host, context)
        if (resolved.reason !== undefined) throw new Error(`ssh: ${resolved.reason}`)
        assertHostToken(resolved.host)
        const activeContext = context?.host === resolved.host ? context : undefined
        const filled = { ...args, host: resolved.host }
        if (filled.cwd === undefined || filled.cwd === null || filled.cwd === '') {
          const cwd = resolveCwd(undefined, activeContext)
          if (cwd !== undefined) filled.cwd = cwd
        }
        if (definition.parameters.properties?.path !== undefined) {
          // With no path and no session directory, the remote home is the only
          // sensible target: `~` is what an omitted path has always meant.
          if (definition.parameters.required?.includes('path') && (typeof args.path !== 'string' || args.path === '')) throw new Error('ssh: path is required')
          filled.path = resolveRemotePath(args.path, activeContext) ?? '~'
        }
        return execute(filled, exec)
      },
    })
  }

  // The host catalog is not host-scoped: it is how an Agent discovers aliases,
  // including which one this session has selected.
  ctx.tools.register({
    name: 'ssh_hosts',
    description:
      'List the SSH hosts configured in ~/.ssh/config, optionally checking which are reachable right now. '
      + 'Use this before ssh_exec to find the alias to work on.',
    parameters: {
      type: 'object',
      properties: {
        probe: {
          type: 'boolean',
          description: 'When true, connect to each host and report reachability, hostname, OS and home directory.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (args, value) => {
        if (value.hosts.length === 0) {
          return text(`No hosts are configured in ${value.configPath}. Add a Host block there and try again.`)
        }
        const rows = value.hosts.map((host) => {
          const target = `${host.user === null ? '' : `${host.user}@`}${host.hostName}${host.port === 22 ? '' : `:${host.port}`}`
          const detail = host.probe === undefined
            ? ''
            : host.probe.reachable
              ? ` — reachable: ${host.probe.user}@${host.probe.hostname} (${host.probe.system}), home ${host.probe.home}`
              : ` — UNREACHABLE: ${host.probe.reason}`
          return `${host.alias} (${target})${detail}`
        })
        const session = value.session === null || value.session === undefined
          ? ''
          : `\n\nThis session is on ${value.session.host}`
            + `${value.session.cwd === null ? '' : `, working in ${value.session.cwd}`}.`
            + ' Host-scoped tools may omit host.'
        return text(`SSH hosts from ${value.configPath}:\n\n${bulletList(rows)}${session}`)
      },
    },
    async execute(args, exec) {
      const { path, hosts } = await listConfiguredHosts()
      const context = contexts.get(contextKey(exec?.agent))
      const session = context === undefined ? null : { host: context.host, cwd: context.cwd }
      if (args.probe !== true) return { configPath: path, hosts, session }
      const probed = []
      for (const host of hosts) {
        probed.push({ ...host, probe: await probeHost(host.alias, { ...common, signal: exec?.signal }) })
        if (exec?.signal?.aborted === true) break
      }
      return { configPath: path, hosts: probed, session }
    },
  })

  registerHostTool({
    name: 'ssh_exec',
    description:
      'Run a shell command on a remote SSH host and return its exit code, stdout and stderr. '
      + 'The command runs through the remote login shell, so pipes, redirects and quoting behave as in a terminal. '
      + 'Authentication is non-interactive: the host must accept a key, the agent, or ssh_config, never a typed password.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        command: { type: 'string', description: 'Command line to run on the remote host.' },
        cwd: { type: 'string', description: 'Remote working directory. Defaults to the remote home directory.' },
        timeout_ms: { type: 'number', description: 'Wall-clock limit in milliseconds. Defaults to 120000.' },
      },
      required: ['host', 'command'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => {
        const parts = [`$ ${value.command}`, '', value.stdout.length > 0 ? value.stdout.replace(/\n$/, '') : '(no output)']
        if (value.stderr.trim() !== '') parts.push('', `stderr:\n${value.stderr.replace(/\n$/, '')}`)
        parts.push('', `exit code ${value.exitCode}${value.timedOut ? ' (timed out)' : ''}${value.truncated ? ' (output truncated)' : ''}`)
        return text(parts.join('\n'))
      },
    },
    async execute(args, exec) {
      const result = await runRemote({
        host: args.host,
        command: args.command,
        cwd: args.cwd,
        timeoutMs: args.timeout_ms ?? settings.defaultTimeoutMs,
        maxOutputBytes: settings.maxOutputBytes,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return { host: args.host, command: args.command, ...result }
    },
  })

  registerHostTool({
    name: 'ssh_read',
    description:
      'Read a UTF-8 text file on a remote SSH host and return line-numbered content. '
      + 'Use offset and limit to continue reading a large file.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote path to read.' },
        offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' },
        limit: { type: 'number', description: 'Maximum number of lines to return. Defaults to 2000.' },
      },
      required: ['host', 'path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => {
        if (value.ok !== true) return text(`ssh_read failed on ${value.host}:${value.path} — ${value.reason}`)
        const body = value.lines.map((line) => `${line.number}: ${line.text}`).join('\n')
        const last = value.lines.at(-1)?.number ?? value.offset - 1
        const footer = value.truncated
          ? `(Showing lines ${value.offset}-${last} of ${value.totalLines}. Use offset=${last + 1} to continue.)`
          : `(End of file - total ${value.totalLines} lines)`
        return text(`<path>${value.path}</path>\n<host>${value.host}</host>\n<content>\n${body}\n\n${footer}\n</content>`)
      },
    },
    async execute(args, exec) {
      return readRemoteFile(args.host, args.path, {
        offset: args.offset,
        limit: args.limit,
        maxOutputBytes: settings.maxOutputBytes,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
    },
  })

  registerHostTool({
    name: 'ssh_write',
    description: 'Write UTF-8 text to a file on a remote SSH host, replacing its whole contents. The parent directory must exist.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote path to write.' },
        content: { type: 'string', description: 'Exact text to write.' },
      },
      required: ['host', 'path', 'content'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(`Wrote ${value.bytes} bytes to ${value.path} on ${value.host}.`)
        : text(`ssh_write failed on ${value.host}:${value.path} — ${value.reason}`)),
    },
    async execute(args, exec) {
      const result = await writeRemoteFile(args.host, args.path, args.content, {
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return { host: args.host, path: args.path, ...result }
    },
  })

  registerHostTool({
    name: 'ssh_edit',
    description:
      'Replace a literal string in a file on a remote SSH host. '
      + 'old_string must match exactly and, unless replace_all is true, exactly once.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote path to edit.' },
        old_string: { type: 'string', description: 'Exact text to replace.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence instead of requiring exactly one.' },
      },
      required: ['host', 'path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(`Replaced ${value.replacements} occurrence${value.replacements === 1 ? '' : 's'} in ${value.path} on ${value.host}.`)
        : text(`ssh_edit failed on ${value.host}:${value.path} — ${value.reason}`)),
    },
    async execute(args, exec) {
      const failure = (reason) => ({ ok: false, host: args.host, path: args.path, reason })
      const read = await readRemoteBytes(args.host, args.path, {
        timeoutMs: settings.defaultTimeoutMs,
        maxBytes: EDIT_MAX_BYTES,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      if (read.ok !== true) return failure(read.reason)
      let original
      try {
        original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(read.bytes)
      } catch {
        return failure('the file is not valid UTF-8 text; use a binary transfer instead')
      }
      if (typeof args.old_string !== 'string' || args.old_string === '') return failure('old_string must be a non-empty string')
      if (args.old_string === args.new_string) return failure('old_string and new_string are identical')
      const occurrences = countOccurrences(original, args.old_string)
      if (occurrences === 0) return failure('old_string was not found in the file')
      if (occurrences > 1 && args.replace_all !== true) {
        return failure(`old_string matched ${occurrences} times; add surrounding context or set replace_all to true`)
      }
      const updated = args.replace_all === true
        ? original.split(args.old_string).join(args.new_string)
        : original.replace(args.old_string, () => args.new_string)
      const written = await writeRemoteFile(args.host, args.path, updated, {
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      if (written.ok !== true) return failure(written.reason)
      return { ok: true, host: args.host, path: args.path, replacements: args.replace_all === true ? occurrences : 1 }
    },
  })

  registerHostTool({
    name: 'ssh_glob',
    description:
      'Find files on a remote SSH host by glob pattern, where ** crosses directories. '
      + 'Example: pattern "src/**/*.py" with cwd "/home/user/project".',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        pattern: { type: 'string', description: 'Glob pattern, interpreted relative to cwd.' },
        cwd: { type: 'string', description: 'Remote directory the pattern is relative to. Defaults to the home directory.' },
        limit: { type: 'number', description: 'Maximum number of paths to return. Defaults to 200.' },
      },
      required: ['host', 'pattern'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(value.paths.length === 0
          ? `No remote paths matched ${value.pattern} under ${value.cwd}.`
          : `Remote paths matching ${value.pattern} under ${value.cwd}:\n\n${bulletList(value.paths)}${value.truncated ? '\n\n(Truncated at the limit.)' : ''}`)
        : text(`ssh_glob failed on ${value.host ?? 'the host'} — ${value.reason}`)),
    },
    async execute(args, exec) {
      const result = await globRemote(args.host, args.pattern, {
        cwd: args.cwd,
        limit: args.limit,
        maxOutputBytes: settings.maxOutputBytes,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return { host: args.host, ...result }
    },
  })

  registerHostTool({
    name: 'ssh_grep',
    description:
      'Search file contents on a remote SSH host for a regular expression, returning path:line:text. '
      + 'Uses ripgrep when the host has it and grep -rn otherwise.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        cwd: { type: 'string', description: 'Remote directory to search. Defaults to the home directory.' },
        include: { type: 'string', description: 'Optional file glob to restrict the search, such as "*.c".' },
        limit: { type: 'number', description: 'Maximum number of matching lines to return. Defaults to 200.' },
      },
      required: ['host', 'pattern'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(value.matches.length === 0
          ? `No remote content matched ${value.pattern} under ${value.cwd}.`
          : `Remote matches for ${value.pattern} under ${value.cwd}:\n\n${value.matches.join('\n')}${value.truncated ? '\n\n(Truncated at the limit.)' : ''}`)
        : text(`ssh_grep failed — ${value.reason}`)),
    },
    async execute(args, exec) {
      const result = await grepRemote(args.host, args.pattern, {
        cwd: args.cwd,
        include: args.include,
        limit: args.limit,
        maxOutputBytes: settings.maxOutputBytes,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return { host: args.host, ...result }
    },
  })

  registerHostTool({
    name: 'ssh_ls',
    description: 'List one directory on a remote SSH host, marking which entries are directories.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote directory to list.' },
      },
      required: ['host'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(value.entries.length === 0
          ? `${value.path} on ${value.host} is empty.`
          : `Contents of ${value.path} on ${value.host}:\n\n${bulletList(value.entries.map((entry) => `${entry.displayName ?? entry.name}${entry.directory ? '/' : ''}${Number.isInteger(entry.size) ? ` (${entry.size} bytes)` : ''}`))}`)
        : text(`ssh_ls failed — ${value.reason}`)),
    },
    async execute(args, exec) {
      const result = await listRemote(args.host, args.path, {
        maxOutputBytes: settings.maxOutputBytes,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return { host: args.host, path: args.path, ...result }
    },
  })

  registerHostTool({
    name: 'ssh_upload',
    description:
      'Copy a local file to a remote SSH host, byte for byte, for content a text write cannot carry. '
      + 'The remote SHA-256 is compared with the local one, so a truncated or altered transfer fails instead of succeeding quietly.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote destination path; its parent directory must exist.' },
        local_path: { type: 'string', description: 'Local file on this machine to send.' },
      },
      required: ['host', 'path', 'local_path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(`Uploaded ${value.bytes} bytes to ${value.path} on ${value.host}.\nSHA-256 ${value.sha256} verified on both sides.`)
        : text(`ssh_upload failed — ${value.reason}`)),
    },
    async execute(args, exec) {
      const failure = (reason) => ({ ok: false, reason })
      let size
      try {
        size = (await stat(args.local_path)).size
      } catch (error) {
        return failure(`cannot read ${args.local_path}: ${error?.message ?? error}`)
      }
      if (size > settings.maxTransferBytes) {
        return failure(`${args.local_path} is ${size} bytes, above the ${settings.maxTransferBytes}-byte transfer limit`)
      }
      let bytes
      try {
        bytes = await readFile(args.local_path)
      } catch (error) {
        return failure(`cannot read ${args.local_path}: ${error?.message ?? error}`)
      }
      if (bytes.length > settings.maxTransferBytes) return failure(`${args.local_path} grew above the ${settings.maxTransferBytes}-byte transfer limit while it was read`)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const result = await writeRemoteBytes(args.host, args.path, bytes, {
        verifySha256: true,
        localSha256: sha256,
        timeoutMs: settings.transferTimeoutMs,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      return result.ok === true
        ? { ok: true, host: args.host, path: args.path, bytes: result.bytes, sha256 }
        : { ok: false, host: args.host, path: args.path, reason: result.reason }
    },
  })

  registerHostTool({
    name: 'ssh_download',
    description:
      'Copy a file from a remote SSH host to this machine, byte for byte, for content a text read cannot carry. '
      + 'The local SHA-256 is compared with the remote one, so a truncated or altered transfer fails instead of succeeding quietly.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        path: { type: 'string', description: 'Remote source path.' },
        local_path: { type: 'string', description: 'Local destination path on this machine.' },
      },
      required: ['host', 'path', 'local_path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => (value.ok === true
        ? text(`Downloaded ${value.bytes} bytes from ${value.path} on ${value.host} to ${value.localPath}.\nSHA-256 ${value.sha256} verified on both sides.`)
        : text(`ssh_download failed — ${value.reason}`)),
    },
    async execute(args, exec) {
      const read = await readRemoteBytes(args.host, args.path, {
        maxBytes: settings.maxTransferBytes,
        timeoutMs: settings.transferTimeoutMs,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      if (read.ok !== true) return { ok: false, host: args.host, path: args.path, reason: read.reason }
      const sha256 = createHash('sha256').update(read.bytes).digest('hex')
      // The digest is confirmed against the host, so a file that changed under the
      // transfer, or a short read, is reported rather than written and trusted.
      const verify = await runRemote({
        host: args.host,
        command: `sha256sum < ${shellQuotePath(args.path)} 2>/dev/null || shasum -a 256 < ${shellQuotePath(args.path)} 2>/dev/null || echo '?'`,
        timeoutMs: settings.defaultTimeoutMs,
        maxOutputBytes: 4096,
        sshExecutable: common.sshExecutable,
        connectTimeoutSeconds: common.connectTimeoutSeconds,
        signal: exec?.signal,
      })
      const remoteSha256 = verify.stdout.trim().split(/\s+/)[0] ?? ''
      if (verify.exitCode !== 0 || !/^[a-fA-F0-9]{64}$/.test(remoteSha256)) {
        return { ok: false, host: args.host, path: args.path, reason: 'the host could not produce a SHA-256 digest to verify the download' }
      }
      if (remoteSha256.toLowerCase() !== sha256) {
        return { ok: false, host: args.host, path: args.path, reason: `the remote digest ${remoteSha256} does not match the transferred digest ${sha256}` }
      }
      try {
        await writeFile(args.local_path, read.bytes)
      } catch (error) {
        return { ok: false, host: args.host, path: args.path, reason: `cannot write ${args.local_path}: ${error?.message ?? error}` }
      }
      return { ok: true, host: args.host, path: args.path, localPath: args.local_path, bytes: read.size, sha256 }
    },
  })

  ctx.tools.register({
    name: 'ssh_connect',
    description:
      'Select the SSH host this session works on, and optionally the directory its work lives in. '
      + 'After this, every other ssh_* tool may omit host, and relative work defaults to that directory. '
      + 'Call ssh_hosts first to see the available aliases.',
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host alias from ~/.ssh/config, or user@hostname.' },
        cwd: { type: 'string', description: 'Remote working directory for this session, such as ~/project. An empty value keeps the current one.' },
        probe: { type: 'boolean', description: 'When true, connect once and report the resolved host, user and home directory.' },
      },
      required: ['host'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => {
        if (value.ok !== true) return text(`ssh_connect failed — ${value.reason}`)
        const probe = value.probe === undefined
          ? ''
          : value.probe.reachable === true
            ? `\nReachable: ${value.probe.user}@${value.probe.hostname} (${value.probe.system}), home ${value.probe.home}`
            : `\nNOT REACHABLE: ${value.probe.reason}`
        return text(`This session now works on ${value.session.host}`
          + `${value.session.cwd === null ? '' : ` in ${value.session.cwd}`}.`
          + '\nOther ssh_* tools may omit host from now on.'
          + probe)
      },
    },
    async execute(args, exec) {
      const host = typeof args.host === 'string' ? args.host.trim() : ''
      assertHostToken(host)
      const cwd = typeof args.cwd === 'string' && args.cwd !== '' ? args.cwd : null
      const stored = contexts.set(contextKey(exec?.agent), { host, cwd })
      const probe = args.probe === true ? await probeHost(host, { ...common, signal: exec?.signal }) : undefined
      // A tool result must be lossless JSON, so an absent probe is omitted rather
      // than sent as `undefined`.
      return {
        ok: true,
        session: { host: stored.host, cwd: stored.cwd },
        ...probe === undefined ? {} : { probe },
      }
    },
  })

  ctx.tools.register({
    name: 'ssh_disconnect',
    description: 'Forget this session\'s selected SSH host, so host-scoped tools must name a host again.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => text(value.cleared === true
        ? `This session no longer has a selected host${value.previous === null ? '.' : `; it was ${value.previous.host}.`}`
        : 'This session had no selected host.'),
    },
    async execute(_args, exec) {
      const key = contextKey(exec?.agent)
      const previous = contexts.get(key)
      await forgetWorkspace(key)
      const cleared = contexts.clear(key)
      return { cleared, previous: previous === undefined ? null : { host: previous.host, cwd: previous.cwd } }
    },
  })

  return { contexts }
}

/** Count non-overlapping occurrences of a literal needle. */
function countOccurrences(haystack, needle) {
  if (needle === '') return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}
