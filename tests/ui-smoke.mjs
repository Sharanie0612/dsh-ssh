import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { testRequire as runtimeRequire, testRequire as profileRequire, browserExecutable } from './helpers/dependencies.mjs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { chromium } = runtimeRequire('playwright')
const assetPrefix = '/__ssh_ui__'

// This fixture executes the shipped module-loader entries with real React DOM.
// Use DSH's installed SlotCore to validate registration shapes. Navigation and
// session creation still come from the small test shell.
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SSH UI regression</title>
<style>html,body,#root{height:100%;margin:0}body{font:13px system-ui;background:#fff;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f5f6f8;--dsw-alias-bg-layer-2:#eef0f4;--dsw-alias-bg-overlay:#d8e0ec;--dsw-alias-label-primary:#202532;--dsw-alias-label-secondary:#657083;--dsw-alias-label-tertiary:#778194;--dsw-alias-border-l1:#d5d9e0;--dsw-alias-border-l2:#b9c1ce;--dsw-alias-border-l3:#d5d9e0;--dsw-radius-xl:16px;--dsw-alias-interactive-bg-hover:#eef0f4;--dsw-alias-brand-primary:#3265de;--dsw-alias-state-error-primary:#bd3030;--dsw-alias-state-success-primary:#268642;--dsw-alias-state-warn-primary:#ad7200}
body[data-ds-dark-theme]{background:#191b20;--dsw-alias-bg-base:#191b20;--dsw-alias-bg-layer-1:#23262d;--dsw-alias-bg-layer-2:#2d3139;--dsw-alias-label-primary:#edf0f5;--dsw-alias-label-secondary:#bec5d1;--dsw-alias-label-tertiary:#8e98a9;--dsw-alias-border-l3:#434a56;--dsw-alias-interactive-bg-hover:#303641}
/*DSH_GUIDE_CSS*/
</style>
<script src="${assetPrefix}/react.js"></script><script src="${assetPrefix}/react-dom.js"></script>
<script>
const chunks = new Map();
const requirePlugin = name => { if(name === 'react') return React; throw Error('unexpected module '+name) };
requirePlugin.async = name => new Promise((resolve,reject) => {
  chunks.set(name.replace('./',''),resolve);
  const script=document.createElement('script');script.src='${assetPrefix}/'+name.replace('./','');script.onerror=()=>reject(Error('chunk failed'));document.head.appendChild(script);
});
window.__ModuleLoader__={load(spec){if(spec.chunk)chunks.get(spec.chunk)(spec.factory(requirePlugin));else window.sshPlugin=spec.factory(requirePlugin)}};
</script><script src="${assetPrefix}/client.js"></script></head><body><div id="root"></div>
<script type="module">
import { SlotCore } from '${assetPrefix}/slots.js';
const slotsCore = new SlotCore();
slotsCore.register({name:'root',children:{
 'sidebar.right.tab.guide.entry':{kind:'keyed',scope:'session'},
 'sidebar.right.pane.tab':{kind:'keyed',scope:'session'},
 'conversation.session.header.utilities':{kind:'list',scope:'session'}
 ,'conversation.session.header.actions':{kind:'list',scope:'session'}
 ,'sidebar.workspaces.directoryFlow':{kind:'single',scope:'root'}
 ,'conversation.hero.workspace.directoryFlow':{kind:'single',scope:'root'}
}},()=>null);
const copy={},seats=new Map(),effects=[],drafts=new Map();
const nativeClasses=__NATIVE_CLASSES__;
const language=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en';
if(new URLSearchParams(location.search).get('theme')==='dark')document.body.setAttribute('data-ds-dark-theme','');
const t=(key,params={})=>(copy[key]??key).replace(/\\{([^}]+)\\}/g,(_,name)=>params[name]??name);
let screen='guide',currentSession='source',projectFlow=false,projects=[]; const reactRoot=ReactDOM.createRoot(document.getElementById('root'));
const openTab=(kind,options)=>{if(kind!=='ssh'||options.replaceTab!==true)throw Error('invalid guide navigation');screen='ssh';render()};
const services={sessions:{list:{getSnapshot:()=>({byId:{source:{cwd:'E:/project'}}})},async create(options){const r=await fetch('/__ssh_ui__/session/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(options)});const answer=await r.json();if(!r.ok)throw Error(answer.reason);return answer.sessionId},retain(id){return{sessionId:id,ready:Promise.resolve(),release(){}}}},uiWorkspace:{workspaces:{list:{getSnapshot:()=>({items:[{workspaceId:'project-ui',sessionIds:['source']}]})}},openSession(id){currentSession=id;screen='conversation';render()}},uiSession:{bindingSource:reference=>({getSnapshot:()=>({props:{inputActions:{setDraft:text=>drafts.set(reference.sessionId,text),submit(){throw Error('SSH selection must not submit a prompt')}}}})})}};
sshPlugin.apply({get:name=>services[name],locale:{bind:()=>t,register:(_,dicts)=>{Object.assign(copy,dicts[language]);return()=>{}}},effect(fn){const dispose=fn();effects.push(dispose);return dispose},sidebarRightTabs:{register:definition=>{window.sshDefinition=definition;return()=>{}}},sidebarRight:{active:()=>({id:'start',kind:'guide'}),openTab},slots:{inject:(_,fn)=>fn(),register(options,Component){const dispose=slotsCore.register(options,Component);seats.set(options.name,{options,Component});return dispose}}});
function render(){
 if(screen==='conversation'){const badge=seats.get('conversation.session.header.utilities');reactRoot.render(React.createElement('main',{'data-session-id':currentSession,style:{padding:30}},React.createElement('h2',null,'Remote conversation'),React.createElement(badge.Component,badge.options.inject(currentSession)),React.createElement('textarea',{'aria-label':'Describe your task',defaultValue:drafts.get(currentSession)??'',style:{width:'90%',height:240}})));return}
 const seat=seats.get(screen==='guide'?'sidebar.right.tab.guide.entry':'sidebar.right.pane.tab');const panel=React.createElement(seat.Component,{...seat.options.inject(currentSession),useTabInfo:()=>({tab:{actions:{openTab}}})});
 if(screen!=='guide'){reactRoot.render(panel);return}
 const examples=language==='zh'?[['工作区文件','浏览会话工作区的文件','▣','Ctrl + P'],['新建终端','在会话工作区运行命令','›_','Ctrl + '+String.fromCharCode(96)],['浏览器','浏览网页','◎','Ctrl + T']]:[['Workspace files','Browse the conversation workspace','▣','Ctrl + P'],['New terminal','Run commands in the workspace','›_','Ctrl + '+String.fromCharCode(96)],['Browser','Browse web pages','◎','Ctrl + T']];
 const cards=examples.map((entry,i)=>React.createElement('button',{key:i,type:'button',className:nativeClasses.entry,'data-native-guide':true},React.createElement('span',{className:nativeClasses.icon,'aria-hidden':true},entry[2]),React.createElement('span',{className:nativeClasses.text},React.createElement('span',{className:nativeClasses.title},entry[0]),React.createElement('span',{className:nativeClasses.description},entry[1])),React.createElement('span',{style:{fontSize:11,color:'var(--dsw-alias-label-tertiary)'}},entry[3])));
 const flow=seats.get('sidebar.workspaces.directoryFlow');
 const addWorkspace=async path=>{const response=await fetch('/__ssh_ui__/workspace/adopt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path})});const result=await response.json();if(!response.ok)throw Error(result.reason);projects.push(result.workspace);projectFlow=false;render()};
 const projectToolbar=new URLSearchParams(location.search).has('projects')?React.createElement('aside',{'aria-label':'Workspaces'},React.createElement('button',{onClick:()=>{projectFlow=true;render()}},language==='zh'?'添加工作区':'Add workspace'),...projects.map(project=>React.createElement('div',{key:project.workspaceId},React.createElement('span',null,project.title),React.createElement('button',{onClick:async()=>{const id=await services.sessions.create({workspaceId:project.workspaceId});services.uiWorkspace.openSession(id)}},language==='zh'?'新会话':'New conversation')))):null;
 reactRoot.render(React.createElement(React.Fragment,null,projectToolbar,React.createElement('div',{className:nativeClasses.guide},...cards,React.createElement('div',{className:nativeClasses.cell},panel)),React.createElement(flow.Component,{...flow.options.inject(),open:projectFlow,busy:false,onPicked:path=>addWorkspace(path),onCancel:()=>{projectFlow=false;render()}})));
}
render();
</script></body></html>`

export async function createUiHandler({ registerSession, registerWorkspace } = {}) {
  const nativeSource = await readFile(join(root, 'artifacts/runtime/dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js'), 'utf8')
  const nativeCSS = JSON.parse(nativeSource.match(/const css\$2 = ("(?:[^"\\]|\\.)*");/)[1])
  const nativePrefix = nativeCSS.match(/\.([A-Za-z0-9]+)_guide\{/)[1]
  const pageHtml = html.replace('/*DSH_GUIDE_CSS*/', nativeCSS).replace('__NATIVE_CLASSES__', JSON.stringify({
    guide: `${nativePrefix}_guide`, entry: `${nativePrefix}_entry`, icon: `${nativePrefix}_entryIcon`, text: `${nativePrefix}_entryText`,
    title: `${nativePrefix}_entryTitle`, description: `${nativePrefix}_entryDescription`, cell: `${nativePrefix}_entryCell`,
  }))
  const files = new Map([
    [`${assetPrefix}/react.js`, profileRequire.resolve('react').replace(/index\.js$/, 'umd/react.development.js')],
    [`${assetPrefix}/react-dom.js`, profileRequire.resolve('react-dom').replace(/index\.js$/, 'umd/react-dom.development.js')],
    [`${assetPrefix}/client.js`, join(root, 'lib/client.js')],
    [`${assetPrefix}/slots.js`, join(root, 'artifacts/runtime/dsh/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js')],
    [`${assetPrefix}/client.term.js`, join(root, 'lib/client.term.js')],
  ])
  const assets = new Map(await Promise.all([...files].map(async ([path, file]) => [path, await readFile(file)])))
  return (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/__ssh_ui__/session/create') {
      void (async () => {
        let body = ''; for await (const chunk of req) body += chunk
        const options = JSON.parse(body)
        if (!registerWorkspace) assert.equal(options.workspaceId, 'project-ui')
        const sessionId = 'ssh-ui-' + Date.now()
        await registerSession?.(sessionId, options)
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ sessionId }))
      })().catch(error => { res.writeHead(400); res.end(JSON.stringify({ reason: error.message })) })
      return true
    }
    if (path === '/__ssh_ui__/workspace/adopt') {
      void (async () => {
        let body = ''; for await (const chunk of req) body += chunk
        const workspace = await registerWorkspace(JSON.parse(body).path)
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ workspace }))
      })().catch(error => { res.writeHead(400); res.end(JSON.stringify({ reason: error.message })) })
      return true
    }
    if (path === '/' || path === '/__ssh_ui__') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(pageHtml); return true
    }
    const source = assets.get(path)
    if (source) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(source); return true
    }
    return false
  }
}

export async function runUiSmoke({ url, hostAlias = 'board-test', live = false, screenshotPath = join(root, 'artifacts', live ? 'ui-live.png' : 'ui-mock.png') }) {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true })
  const errors = [], calls = [], checks = []
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('request', (request) => {
      if (request.url().includes('/api/ssh/')) calls.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() })
    })
    const passed = (label) => { checks.push(label); console.log('PASS ' + label) }
    await page.goto(url)
    const native = await page.locator('[data-native-guide]').first().boundingBox()
    const sshGuide = await page.locator('[data-sidebar-right-guide-entry="ssh"]').boundingBox()
    assert.equal(sshGuide.width, native.width)
    assert.equal(sshGuide.height, native.height)
    await page.screenshot({ path: join(root, 'artifacts/guide-matched.png') })
    passed('SSH guide dimensions match the shipped DSH guide cards')
    await page.getByRole('button', { name: 'New SSH session', exact: false }).click()
    await page.getByText(hostAlias, { exact: true }).click()
    await page.getByPlaceholder('Run a command on ' + hostAlias).waitFor()
    passed('guide opens the SSH panel and a real host row selects')

    const hostRow = page.locator('.dshssh-row').filter({ has: page.getByText(hostAlias, { exact: true }) })
    await hostRow.getByRole('button', { name: 'Test', exact: true }).click()
    await hostRow.locator('[data-state="ok"]').waitFor({ timeout: 25000 })
    passed('host probe click renders a successful reachability result')

    await page.getByPlaceholder('Run a command on ' + hostAlias).fill("printf '__SSH_UI_%s__\\n' 'EXEC'")
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await page.getByText('__SSH_UI_EXEC__', { exact: true }).waitFor({ timeout: 25000 })
    await page.getByText('exit 0', { exact: true }).waitFor()
    passed('command input and Run click display SSH stdout and exit 0')

    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('button[disabled]'))
    for (let i = 0; i < 12; i += 1) {
      const path = await page.locator('.dshssh-compose .dshssh-path').innerText()
      if (path === '/') break
      await page.getByRole('button', { name: 'Up', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('button[disabled]'))
    }
    assert.equal(await page.locator('.dshssh-compose .dshssh-path').innerText(), '/')
    await page.getByText('etc/', { exact: true }).click()
    await page.getByText('hostname', { exact: true }).click()
    await page.locator('.dshssh-card .dshssh-out').waitFor({ timeout: 25000 })
    assert.ok((await page.locator('.dshssh-card .dshssh-out').innerText()).match(/^1: .+/))
    passed('Files, Refresh, Up, directory and text preview all update the DOM')
    await page.getByRole('button', { name: 'Hosts', exact: true }).click()

    await page.getByRole('button', { name: 'Terminal', exact: true }).click()
    await page.locator('.xterm-helper-textarea').waitFor({ timeout: 15000 })
    await page.getByText('connected', { exact: true }).waitFor({ timeout: 25000 })
    if (live) {
      // PTY allocation precedes SSH authentication. ConPTY's initial output
      // does not prove the remote shell is ready to accept a command.
      await page.waitForFunction(() => /[$#]\s*$/.test(document.querySelector('.xterm-screen')?.innerText ?? ''), null, { timeout: 30000 })
    }
    const term = page.locator('.xterm-helper-textarea')
    await term.focus()
    await page.keyboard.type("printf '__SSH_UI_%s__\\n' 'TERM'", { delay: 4 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.xterm-screen')?.innerText.includes('__SSH_UI_TERM__'), null, { timeout: 25000 })
    passed('generated xterm chunk loads and real keyboard input produces terminal output')
    await page.setViewportSize({ width: 870, height: 680 })
    await page.waitForTimeout(220)
    const opened = calls.find((call) => call.path.endsWith('/term/open'))
    assert.ok(calls.some((call) => call.path.endsWith('/term/resize') && call.body.cols !== opened.body.cols))
    passed('terminal dimensions propagate after the viewport resizes')
    await mkdir(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath })
    const closed = page.waitForResponse((response) => response.url().endsWith('/api/ssh/term/close'))
    await page.getByRole('button', { name: 'Hosts', exact: true }).click()
    await page.getByRole('button', { name: 'Terminal', exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('.xterm'))
    const closedResponse = await closed
    assert.equal(closedResponse.status(), 200)
    assert.equal((await closedResponse.json()).ok, true)
    passed('returning to Hosts disposes xterm and closes its remote PTY')
    assert.deepEqual(errors, [], 'browser runtime errors')
    return { checks, calls, errors, screenshotPath }
  } finally {
    await browser.close()
  }
}

export async function startMockUiServer() {
  const handler = await createUiHandler()
  let terminal = null, nextId = 0
  const server = createServer(async (req, res) => {
    if (handler(req, res)) return
    if (!req.url.startsWith('/api/ssh/')) { res.writeHead(404); res.end(); return }
    let body = ''; for await (const chunk of req) body += chunk
    const payload = JSON.parse(body || '{}'), endpoint = req.url.slice('/api/ssh/'.length)
    const reply = (value) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, ...value })) }
    if (endpoint === 'hosts') return reply({ configPath: '/home/test/.ssh/config', hosts: [{ alias: 'board-test', hostName: '127.0.0.1', user: 'test', port: 22 }] })
    if (endpoint === 'probe') return reply({ probe: { reachable: true, user: 'test', hostname: 'board', system: 'Linux' } })
    if (endpoint === 'exec') return reply({ result: { stdout: '__SSH_UI_EXEC__\n', stderr: '', exitCode: 0 } })
    if (endpoint === 'ls') {
      const path = payload.path === '~' ? '/home/test' : payload.path
      return reply({ resolvedPath: path, entries: path === '/' ? [{ name: 'etc', directory: true }] : path === '/etc' ? [{ name: 'hostname', directory: false, size: 6 }] : [] })
    }
    if (endpoint === 'file') return reply({ lines: [{ number: 1, text: 'board' }], totalLines: 1 })
    if (endpoint === 'workspace/get') return reply({ workspace: null })
    if (endpoint === 'workspace/select') return reply({ workspace: { host: payload.host, cwd: payload.cwd, file: payload.file ?? null }, durable: true })
    if (endpoint === 'term/open') { terminal = { id: 'mock-' + ++nextId, text: 'test@board:~$ ', seq: 1, input: '', exited: false }; return reply({ term: terminal }) }
    if (endpoint === 'term/write') {
      terminal.input += payload.data
      if (terminal.input.includes('\r')) { terminal.text = '\r\n__SSH_UI_TERM__\r\ntest@board:~$ '; terminal.seq++; terminal.input = '' }
      return reply({})
    }
    if (endpoint === 'term/read') {
      await new Promise((resolve) => setTimeout(resolve, 35))
      return reply({ text: payload.since < terminal.seq ? terminal.text : '', seq: terminal.seq, term: terminal })
    }
    if (endpoint === 'term/resize') return reply({ term: terminal })
    if (endpoint === 'term/close') { terminal.exited = true; return reply({}) }
    res.writeHead(400); res.end(JSON.stringify({ ok: false, reason: 'unknown mock endpoint' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((resolve) => server.close(resolve)) }
}

export async function runWorkspaceUiSmoke({ url, hostAlias = 'board-test' }) {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true })
  const results = []
  try {
    for (const selectFile of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
      const errors = [], requests = []
      page.on('pageerror', error => errors.push(String(error)))
      page.on('request', request => {
        if (request.url().endsWith('/api/ssh/workspace/select')) requests.push(request.postDataJSON())
      })
      await page.goto(url)
      await page.getByRole('button', { name: 'New SSH session', exact: false }).click()
      await page.getByText(hostAlias, { exact: true }).click()
      await page.getByRole('button', { name: 'Files', exact: true }).click()
      for (let i = 0; i < 12; i++) {
        await page.waitForFunction(() => !document.querySelector('button[disabled]'))
        if (await page.locator('.dshssh-compose .dshssh-path').innerText() === '/') break
        await page.getByRole('button', { name: 'Up', exact: true }).click()
      }
      await page.getByText('etc/', { exact: true }).click()
      if (selectFile) {
        await page.getByText('hostname', { exact: true }).click()
        await page.getByRole('button', { name: 'New conversation about this file', exact: true }).click()
      } else {
        await page.getByRole('button', { name: 'New conversation in this directory', exact: true }).click()
      }
      const composer = page.getByRole('textbox', { name: 'Describe your task' })
      await composer.waitFor()
      const draft = await composer.inputValue()
      assert.equal(draft, '')
      await page.getByText(`SSH · ${hostAlias} · ${selectFile ? '/etc/hostname' : '/etc'}`, { exact: true }).waitFor()
      assert.equal(requests.length, 1)
      assert.equal(requests[0].file, selectFile ? '/etc/hostname' : null)
      assert.deepEqual(errors, [])
      const sessionId = await page.locator('[data-session-id]').getAttribute('data-session-id')
      if (selectFile) await page.screenshot({ path: join(root, 'artifacts/remote-conversation.png') })
      results.push({ sessionId, draft, file: selectFile })
      console.log(`PASS ${selectFile ? 'file' : 'directory'} selection opens a project conversation with a graphical SSH target and an empty composer`)
      await page.close()
    }
    return results
  } finally { await browser.close() }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mock = await startMockUiServer()
  try {
    const result = await runUiSmoke({ url: mock.origin })
    console.log(JSON.stringify({ checks: result.checks.length, requests: result.calls.length, errors: result.errors, screenshotPath: result.screenshotPath }, null, 2))
  }
  finally { await mock.close() }
}
