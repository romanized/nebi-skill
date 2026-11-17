// Turn an @xterm/headless buffer into plain text and a cell-exact HTML page,
// then into a PNG with headless Chrome.
import { readFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CACHE, fontDir } from './deps.mjs'

// NEBI_CHROME points at another Chrome binary. Its headless profile lives in the cache, never the user's.
const CHROME = process.env.NEBI_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const FONT_SIZE = 14
export const LINE_HEIGHT = 17
const CELL_W = FONT_SIZE * 0.6 // JetBrains Mono advance is 600/1000 em
const PAD = 14

// Ghostty theme: Catppuccin Latte (from ~/.config/ghostty/config, light side).
// Falls back to these values if the theme file cannot be read.
const LATTE = {
  background: '#eff1f5', foreground: '#4c4f69',
  palette: ['#5c5f77', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#acb0be',
    '#6c6f85', '#de293e', '#49af3d', '#eea02d', '#456eff', '#fe85d8', '#2d9fa8', '#bcc0cc'],
}

export function loadGhosttyTheme() {
  try {
    const cfg = readFileSync(join(process.env.HOME, '.config/ghostty/config'), 'utf8')
    const m = cfg.match(/^\s*theme\s*=\s*(.+)$/m)
    if (!m) return { name: 'Catppuccin Latte (default)', ...LATTE }
    let name = m[1].trim()
    const light = name.match(/light:([^,]+)/)
    if (light) name = light[1].trim()
    const file = join('/Applications/Ghostty.app/Contents/Resources/ghostty/themes', name)
    if (!existsSync(file)) return { name: `${name} (not found, using Latte)`, ...LATTE }
    const theme = { name, background: LATTE.background, foreground: LATTE.foreground, palette: [...LATTE.palette] }
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      let mm
      if ((mm = line.match(/^palette\s*=\s*(\d+)=(#[0-9a-fA-F]{6})/))) theme.palette[+mm[1]] = mm[2]
      else if ((mm = line.match(/^background\s*=\s*(#[0-9a-fA-F]{6})/))) theme.background = mm[1]
      else if ((mm = line.match(/^foreground\s*=\s*(#[0-9a-fA-F]{6})/))) theme.foreground = mm[1]
    }
    return theme
  } catch {
    return { name: 'Catppuccin Latte (fallback)', ...LATTE }
  }
}

function xterm256(theme) {
  const p = [...theme.palette]
  const lv = [0, 95, 135, 175, 215, 255]
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) p.push(rgb(lv[r], lv[g], lv[b]))
  for (let i = 0; i < 24; i++) { const v = 8 + 10 * i; p.push(rgb(v, v, v)) }
  return p
}
const rgb = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
const hex = n => '#' + n.toString(16).padStart(6, '0')
function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return rgb(...pa.map((v, i) => Math.round(v * (1 - t) + pb[i] * t)))
}

function viewportRange(term) {
  const buf = term.buffer.active
  return { buf, start: buf.baseY, end: buf.baseY + term.rows }
}

export function screenText(term) {
  const { buf, start, end } = viewportRange(term)
  const out = []
  for (let y = start; y < end; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  return out.join('\n') + '\n'
}

export function fullText(term) {
  const buf = term.buffer.active
  const out = []
  for (let y = 0; y < buf.length; y++) out.push(buf.getLine(y)?.translateToString(true) ?? '')
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function screenHTML(term, theme, title) {
  const pal = xterm256(theme)
  const { buf, start, end } = viewportRange(term)
  const color = (mode, value, isDefault, fallback) => {
    if (isDefault) return fallback
    if (mode === 'rgb') return hex(value)
    return pal[value] ?? fallback
  }
  const classes = new Map()
  const cls = css => {
    if (!classes.has(css)) classes.set(css, `c${classes.size}`)
    return classes.get(css)
  }
  const rows = []
  let cell
  for (let y = start; y < end; y++) {
    const line = buf.getLine(y)
    let html = ''
    for (let x = 0; line && x < term.cols; x++) {
      cell = line.getCell(x, cell)
      const w = cell.getWidth()
      if (w === 0) continue // trailing half of a wide char
      let fg = color(cell.isFgRGB() ? 'rgb' : 'pal', cell.getFgColor(), cell.isFgDefault(), theme.foreground)
      let bg = color(cell.isBgRGB() ? 'rgb' : 'pal', cell.getBgColor(), cell.isBgDefault(), null)
      if (cell.isInverse()) { const f = fg; fg = bg ?? theme.background; bg = f }
      if (cell.isDim()) fg = mix(fg, bg ?? theme.background, 0.5)
      if (cell.isInvisible()) fg = bg ?? theme.background
      let css = `color:${fg};`
      if (bg) css += `background:${bg};`
      if (cell.isBold()) css += 'font-weight:700;'
      if (cell.isItalic()) css += 'font-style:italic;'
      const deco = [cell.isUnderline() && 'underline', cell.isStrikethrough() && 'line-through'].filter(Boolean)
      if (deco.length) css += `text-decoration:${deco.join(' ')};`
      // Chrome would draw U+23FA as an emoji button; Ghostty draws a plain dot. HTML only, the .txt keeps the real char.
      const ch = (cell.getChars() || ' ').replace('\u23fa', '\u25cf')
      html += `<i class="${cls(css)}${w === 2 ? ' w2' : ''}">${esc(ch)}</i>`
    }
    rows.push(`<div class="r">${html}</div>`)
  }
  const font = n => readFileSync(join(fontDir(), `jetbrains-mono-latin-${n}-normal.woff2`)).toString('base64')
  const styles = [...classes].map(([css, c]) => `.${c}{${css}}`).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@font-face{font-family:JBM;font-weight:400;src:url(data:font/woff2;base64,${font(400)}) format('woff2')}
@font-face{font-family:JBM;font-weight:700;src:url(data:font/woff2;base64,${font(700)}) format('woff2')}
html,body{margin:0;background:${theme.background}}
.t{padding:${PAD}px;font-family:JBM,'SF Mono',Menlo,'Apple Symbols','Apple Color Emoji',monospace;font-size:${FONT_SIZE}px;line-height:${LINE_HEIGHT}px;color:${theme.foreground}}
.r{height:${LINE_HEIGHT}px;white-space:pre;display:flex}
.r i{display:block;flex:none;width:${CELL_W}px;height:${LINE_HEIGHT}px;font-style:normal;overflow:visible;text-align:left}
.r i.w2{width:${CELL_W * 2}px;overflow:hidden;text-align:center}
${styles}
</style></head><body><div class="t">
${rows.join('\n')}
</div></body></html>`
}

export function pageSize(term) {
  return { width: Math.ceil(term.cols * CELL_W + PAD * 2), height: term.rows * LINE_HEIGHT + PAD * 2 }
}

// Headless Chrome writes the screenshot but on this Mac it does not exit afterwards,
// so wait for its "bytes written" line, then stop it.
export function htmlToPng(htmlPath, pngPath, { width, height }) {
  const profile = join(CACHE, 'chrome-profile')
  mkdirSync(profile, { recursive: true })
  rmSync(pngPath, { force: true })
  return new Promise((resolve, reject) => {
    const chrome = spawn(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      // Never touch the macOS keychain: without these, a temporary HOME pops a "Keychain Not Found" dialog.
      '--use-mock-keychain', '--password-store=basic',
      `--user-data-dir=${profile}`, '--force-device-scale-factor=2',
      `--window-size=${width},${height}`, `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = '', done = false
    const finish = ok => {
      if (done) return
      done = true; clearTimeout(timer)
      chrome.kill('SIGTERM'); setTimeout(() => chrome.kill('SIGKILL'), 2000).unref()
      ok ? resolve() : reject(new Error(`chrome screenshot failed: ${err.slice(-500)}`))
    }
    chrome.stderr.on('data', d => { err += d; if (/bytes written to file/.test(err)) setTimeout(() => finish(true), 300) })
    chrome.on('exit', () => finish(existsSync(pngPath) && statSync(pngPath).size > 0))
    const timer = setTimeout(() => finish(existsSync(pngPath) && statSync(pngPath).size > 0), 45000)
  })
}
