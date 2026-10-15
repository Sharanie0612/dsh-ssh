import { mkdir, writeFile } from 'node:fs/promises'

// Documentation artwork only. No runtime dependencies or application changes.
const output = new URL('../docs/images/', import.meta.url)
await mkdir(output, { recursive: true })

const fonts = '&quot;Segoe UI&quot;, &quot;Microsoft YaHei&quot;, &quot;PingFang SC&quot;, &quot;Noto Sans CJK SC&quot;, Arial, sans-serif'
const mono = 'Consolas, &quot;SFMono-Regular&quot;, monospace'
const text = (x, y, value, size = 24, color = '#52677d', weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${value}</text>`

const icons = {
  workspace: '<path d="M5 12h15l5 6h23v27H5z"/><path d="M5 21h43"/>',
  files: '<path d="M14 5h18l10 10v34H14z"/><path d="M32 5v11h10M22 27h12M22 36h12"/>',
  terminal: '<rect x="4" y="8" width="46" height="37" rx="6"/><path d="m14 20 7 7-7 7M28 34h10"/>',
  agent: '<path d="m18 14-11 13 11 13M36 14l11 13-11 13M30 9l-7 36"/>',
}
const icon = (name, x, y, scale = 1, color = '#3977b3') =>
  `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</g>`

const svg = (width, height, title, description, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${description}</desc>
  <defs>
    <filter id="shadow" x="-15%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="#486788" flood-opacity=".07"/>
    </filter>
  </defs>
  <g font-family="${fonts}">${content}</g>
</svg>
`

function hero(mobile = false) {
  if (mobile) return svg(640, 490, 'DSH SSH · 远端工程，也能近在手边。', 'DeepSeek Harness SSH 插件。浅色工作区卡片示意。', `
    <rect x="1" y="1" width="638" height="488" rx="28" fill="#f5f8fc" stroke="#e1e8f1"/>
    <path d="M436 1h175q28 0 28 28v192a214 214 0 0 1-203-220" fill="#eaf2fc"/>
    <rect x="36" y="35" width="66" height="66" rx="18" fill="#fff" stroke="#dfe8f3"/>
    ${icon('terminal', 44, 44, .92)}
    ${text(121, 77, 'DEEPSEEK HARNESS', 19, '#647d95', 600, 'letter-spacing="1.2"')}
    ${text(34, 197, 'DSH <tspan fill="#377bb7">SSH</tspan>', 88, '#213449', 700, 'letter-spacing="-3"')}
    ${text(38, 254, '远端工程，也能近在手边。', 30, '#52677d', 500)}
    <g filter="url(#shadow)">
      <rect x="36" y="299" width="568" height="116" rx="20" fill="#fff" stroke="#e0e8f0"/>
      <rect x="56" y="324" width="64" height="64" rx="16" fill="#edf7f3"/>
      ${icon('workspace', 62, 330, .95, '#4c977b')}
      ${text(139, 348, 'dev-vm', 27, '#344f68', 600)}
      ${text(139, 382, '~/projects/demo', 22, '#7c8ea1', 400, `font-family="${mono}"`)}
      <circle cx="572" cy="353" r="7" fill="#79b89e"/>
    </g>
    ${text(38, 459, 'OpenSSH  ·  Workspace  ·  Agent  ·  Terminal', 19, '#71869b')}
  `)

  return svg(1200, 400, 'DSH SSH · 远端工程，也能近在手边。', 'DeepSeek Harness SSH 插件：工作区、文件浏览、交互终端与 Agent 协作。浅色卡片为功能示意。', `
    <rect x="1" y="1" width="1198" height="398" rx="28" fill="#f5f8fc" stroke="#e1e8f1"/>
    <path d="M969 1h202q28 0 28 28v270A290 290 0 0 1 969 1" fill="#eaf2fc"/>
    <rect x="54" y="43" width="60" height="60" rx="17" fill="#fff" stroke="#dfe8f3"/>
    ${icon('terminal', 60, 49, .9)}
    ${text(132, 80, 'DEEPSEEK HARNESS', 18, '#647d95', 600, 'letter-spacing="1.8"')}
    ${text(51, 207, 'DSH <tspan fill="#377bb7">SSH</tspan>', 100, '#213449', 700, 'letter-spacing="-4"')}
    ${text(58, 266, '远端工程，也能近在手边。', 33, '#52677d', 500)}
    <g font-size="17" fill="#688198">
      <rect x="57" y="307" width="113" height="37" rx="12" fill="#fff" stroke="#e1e8f0"/>
      <text x="77" y="332">OpenSSH</text>
      <rect x="180" y="307" width="90" height="37" rx="12" fill="#edf6f1" stroke="#dfece5"/>
      <text x="203" y="332" fill="#5b8b75">Agent</text>
      <rect x="280" y="307" width="111" height="37" rx="12" fill="#f1eef9" stroke="#e7e3f1"/>
      <text x="299" y="332" fill="#8476a4">Terminal</text>
    </g>
    <g filter="url(#shadow)">
      <rect x="685" y="57" width="447" height="207" rx="23" fill="#fff" stroke="#dde7f1"/>
      <rect x="707" y="80" width="60" height="60" rx="16" fill="#edf6f1"/>
      ${icon('workspace', 711, 84, .98, '#4c977b')}
      ${text(784, 108, 'dev-vm', 27, '#344f68', 600)}
      ${text(784, 138, '~/projects/demo', 18, '#8a9bad', 400, `font-family="${mono}"`)}
      <circle cx="1100" cy="105" r="6" fill="#79b89e"/>
      <rect x="715" y="172" width="139" height="9" rx="4.5" fill="#e5edf5"/>
      <rect x="715" y="196" width="249" height="9" rx="4.5" fill="#eff3f8"/>
      <rect x="715" y="220" width="191" height="9" rx="4.5" fill="#eff3f8"/>
    </g>
    <g filter="url(#shadow)">
      <rect x="753" y="226" width="394" height="120" rx="20" fill="#fff" stroke="#dfe7f1"/>
      <circle cx="775" cy="247" r="3.5" fill="#b5c6d9"/><circle cx="788" cy="247" r="3.5" fill="#cfdae7"/><circle cx="801" cy="247" r="3.5" fill="#e0e7ef"/>
      ${text(776, 286, '<tspan fill="#5c9a81">$</tspan> git status --short', 22, '#506b84', 400, `font-family="${mono}"`)}
      <rect x="779" y="309" width="127" height="7" rx="3.5" fill="#e8f1ed"/>
      <rect x="917" y="309" width="65" height="7" rx="3.5" fill="#edf2f7"/>
    </g>
  `)
}

const features = [
  { title: '远端工作区', lines: ['选好主机与目录', '新对话自动继承工程上下文'], icon: 'workspace', fill: '#f1f7fd', border: '#e0ebf6', accent: '#5b8fbc', tag: 'WORKSPACE' },
  { title: '文件浏览', lines: ['浏览目录、预览文本', '从文件或目录发起对话'], icon: 'files', fill: '#f0f8f4', border: '#e0eee7', accent: '#639b81', tag: 'FILES' },
  { title: '交互终端', lines: ['在 DSH 中打开 SSH 会话', '支持中文输入与尺寸调整'], icon: 'terminal', fill: '#f5f3fb', border: '#e8e3f2', accent: '#9180b0', tag: 'TERMINAL' },
  { title: 'Agent 协作', lines: ['命令执行、代码搜索与编辑', '传输文件并校验 SHA-256'], icon: 'agent', fill: '#fdf8ef', border: '#f0e8d9', accent: '#b39a66', tag: 'AGENT TOOLS' },
]

function featureCards(mobile = false) {
  const width = mobile ? 640 : 1200
  const height = mobile ? 1032 : 520
  const cardWidth = mobile ? 608 : 580
  const cards = features.map((f, index) => {
    const x = mobile ? 16 : 8 + (index % 2) * 604
    const y = mobile ? 8 + index * 256 : 8 + Math.floor(index / 2) * 256
    return `<g transform="translate(${x} ${y})">
      <rect x="0.5" y="0.5" width="${cardWidth - 1}" height="239" rx="23" fill="${f.fill}" stroke="${f.border}"/>
      <rect x="27" y="32" width="70" height="70" rx="20" fill="#fff" stroke="${f.border}"/>
      ${icon(f.icon, 35, 40, 1, f.accent)}
      ${text(120, 73, f.title, 34, '#2d4359', 600)}
      ${text(121, 120, f.lines[0], 24, '#61768a')}
      ${text(121, 156, f.lines[1], 24, '#61768a')}
      ${text(122, 208, f.tag, 14, f.accent, 600, 'letter-spacing="1.7"')}
      ${text(cardWidth - 55, 208, `0${index + 1}`, 17, f.accent, 500)}
    </g>`
  }).join('\n')
  return svg(width, height, 'DSH SSH 功能卡片', '远端工作区：选择主机与目录。文件浏览：浏览目录与预览文本。交互终端：中文输入与尺寸调整。Agent 协作：命令执行、代码搜索编辑与文件传输。', cards)
}

for (const [filename, artwork] of [
  ['readme-light-hero.svg', hero()],
  ['readme-light-hero-mobile.svg', hero(true)],
  ['readme-light-features.svg', featureCards()],
  ['readme-light-features-mobile.svg', featureCards(true)],
]) {
  await writeFile(new URL(filename, output), artwork)
  console.log(filename)
}
