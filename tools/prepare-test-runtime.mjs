// Extract the installed Desktop runtime for opt-in integration tests, without
// changing the installation or profile. Run once after a Desktop update.
import { openSync, readSync, closeSync, existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const archive = resolve(process.argv[2] ?? 'D:/dsh/resources/app.asar')
const destination = join(root, 'artifacts/runtime')
const prefix = 'dsh/node_modules/'
const fd = openSync(archive, 'r')
let copied = 0
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const size = head.readUInt32LE(12)
  const buffer = Buffer.alloc(size)
  readSync(fd, buffer, 0, size, 16)
  const header = JSON.parse(buffer.toString('utf8'))
  const base = 16 + size
  const visit = (node, path = '') => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const source = path ? `${path}/${name}` : name
      if (entry.files) { visit(entry, source); continue }
      if (!source.startsWith(prefix)) continue
      // Office/image/audio dependencies are unrelated to this plugin's tests.
      if (/libreoffice-kit|\/sharp|sherpa-onnx/.test(source)) continue
      const target = resolve(destination, source)
      const local = relative(destination, target)
      if (local.startsWith(`..${sep}`) || local === '..' || resolve(target) === destination) throw Error('Unsafe archive path')
      mkdirSync(dirname(target), { recursive: true })
      if (entry.unpacked) {
        const unpacked = join(`${archive}.unpacked`, source)
        if (existsSync(unpacked)) { cpSync(unpacked, target); copied++ }
      } else if (Number.isSafeInteger(entry.size)) {
        const bytes = Buffer.alloc(entry.size)
        if (bytes.length) readSync(fd, bytes, 0, bytes.length, base + Number(entry.offset))
        writeFileSync(target, bytes)
        copied++
      }
    }
  }
  visit(header)
  console.log(`Prepared ${copied} Desktop runtime files in ${destination}`)
} finally { closeSync(fd) }
