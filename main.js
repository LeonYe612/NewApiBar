const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron')
const https = require('https')
const http = require('http')
const path = require('path')
const fs = require('fs')

let win = null
let tray = null
let refreshTimer = null
let latestSummary = null  // 缓存最新数据用于托盘展示

const CONFIG_PATH = path.join(app.getPath('userData'), 'widget-config.json')
const DEBUG_LOG = '/tmp/newapibar-debug.log'

// ── 调试日志 ────────────────────────────────
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    if (!fs.existsSync(DEBUG_LOG)) {
      fs.writeFileSync(DEBUG_LOG, line, { mode: 0o600 })
    } else {
      fs.appendFileSync(DEBUG_LOG, line)
    }
  } catch {}
}

// ── 配置读写 ───────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  catch { return {} }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

// ── 标准化域名 ─────────────────────────────
function normalizeBase(raw) {
  let u = raw.trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  if (u.endsWith('/')) u = u.slice(0, -1)
  return u
}

// ── HTTP GET ───────────────────────────────
function apiGet(apiBase, endpoint, cookies, apiUser) {
  return new Promise((resolve, reject) => {
    const fullUrl = apiBase + endpoint
    const urlObj = new URL(fullUrl)
    const lib = urlObj.protocol === 'https:' ? https : http
    debugLog(`GET ${fullUrl} hasCookies=${!!cookies} user=${apiUser || 'none'}`)
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
    if (cookies) headers['Cookie'] = cookies
    if (apiUser) headers['New-Api-User'] = apiUser

    const req = lib.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'GET',
      headers,
      timeout: 10000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        debugLog(`  -> HTTP ${res.statusCode} body=${data.substring(0, 300)}`)
        try {
          const parsed = JSON.parse(data)
          resolve({
            ok: res.statusCode < 400 && parsed?.success !== false,
            status: res.statusCode,
            data: parsed,
            raw: data,
            error: parsed?.message || null
          })
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null, raw: data, error: '非 JSON 响应' })
        }
      })
    })
    req.on('error', e => { debugLog(`  -> ERROR ${e.message}`); reject(e) })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

// ── HTTP POST（登录用，返回 cookies）─────────
function apiPost(apiBase, endpoint, bodyObj) {
  return new Promise((resolve, reject) => {
    const fullUrl = apiBase + endpoint
    const urlObj = new URL(fullUrl)
    const lib = urlObj.protocol === 'https:' ? https : http
    const body = JSON.stringify(bodyObj)
    debugLog(`POST ${fullUrl}`)

    const req = lib.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || []
        const cookies = setCookie.map(h => h.split(';')[0].trim()).join('; ')
        debugLog(`  -> HTTP ${res.statusCode} hasCookies=${!!(setCookie && setCookie.length)} body=${data.substring(0, 300)}`)
        try {
          const parsed = JSON.parse(data)
          resolve({
            ok: res.statusCode < 400 && parsed?.success !== false,
            status: res.statusCode,
            data: parsed,
            raw: data,
            cookies: cookies || '',
            error: parsed?.message || null
          })
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null, raw: data, cookies: cookies || '', error: '非 JSON 响应' })
        }
      })
    })
    req.on('error', e => { debugLog(`  -> ERROR ${e.message}`); reject(e) })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end(body)
  })
}

// ── 登录 ───────────────────────────────────
async function login(apiBase, username, password) {
  const result = await apiPost(apiBase, '/api/user/login', { username, password })
  if (!result.ok) {
    return { ok: false, error: result.error || `登录失败 HTTP ${result.status}` }
  }

  const userData = result.data?.data || {}
  const apiUser = String(userData?.id || userData?.username || username)

  if (result.cookies) {
    debugLog(`LOGIN: user=${apiUser} hasCookies=${!!result.cookies}`)
    return { ok: true, cookies: result.cookies, apiUser }
  }

  return { ok: false, error: '登录成功但未获取到认证凭据' }
}

// ── 翻页拉取全部日志 ──────────────────────────
async function fetchAllLogPages(apiBase, basePath, cookies, user) {
  const first = await apiGet(apiBase, basePath + '&page_size=100', cookies, user)
  if (!first?.ok) return first
  const total = first.data?.data?.total || 0
  const allItems = [...(first.data?.data?.items || [])]
  const totalPages = Math.ceil(total / 100)
  debugLog(`fetchAllLogPages: total=${total} pages=${totalPages}`)

  if (totalPages > 1) {
    const promises = []
    // API 翻页：p=0 和 p=1 返回相同数据，从 p=2 开始才到第二页
    for (let p = 2; p <= totalPages; p++) {
      promises.push(apiGet(apiBase, basePath + '&page_size=100&p=' + p, cookies, user))
    }
    const results = await Promise.all(promises)
    for (const r of results) {
      if (r?.ok) {
        const items = r.data?.data?.items || []
        allItems.push(...items)
      }
    }
  }
  debugLog(`fetchAllLogPages: collected ${allItems.length} items`)
  return { ok: true, data: { data: { items: allItems, total: allItems.length } } }
}

// ── 拉取所有数据 ─────────────────────────────
async function fetchAllData(apiBase, auth) {
  const cookies = auth?.cookies || ''
  const user = auth?.apiUser || auth?.username || ''

  if (!cookies && !auth?.token) return { error: '未登录，请先输入域名和账号密码' }
  if (!apiBase) return { error: '未设置 API 地址，请在设置中输入域名' }

  const results = {}
  const errors = {}
  try { results.userInfo = await apiGet(apiBase, '/api/user/self', cookies, user) } catch (e) { errors.userInfo = e.message }
  try { results.tokens = await apiGet(apiBase, '/api/token/?p=0&page_size=50', cookies, user) } catch (e) { errors.tokens = e.message }

  const now = new Date()
  const bjTime = new Date(now.getTime() + (8 * 3600 * 1000))
  const y = bjTime.getUTCFullYear()
  const m = bjTime.getUTCMonth()
  const d = bjTime.getUTCDate()

  const bjTodayStart = (Date.UTC(y, m, d) / 1000) - (8 * 3600)
  const bjTodayEnd = bjTodayStart + 86399
  const logBase = `/api/log/self?start_timestamp=${bjTodayStart}&end_timestamp=${bjTodayEnd}`;
  try { results.logs = await fetchAllLogPages(apiBase, logBase, cookies, user) } catch (e) { errors.logs = e.message }
  try { results.status = await apiGet(apiBase, '/api/status', '', '') } catch (e) { errors.status = e.message }

  if (results.userInfo?.status === 401 || results.logs?.status === 401) {
    debugLog('fetchAllData: 401 detected, cookie likely expired')
    return { ok: true, ...results, error: '登录已过期，请重新登录', expired: true }
  }

  debugLog(`fetchAllData: hasUserInfo=${results.userInfo?.ok} hasTokens=${results.tokens?.ok} hasLogs=${results.logs?.ok}`)
  if (Object.keys(errors).length > 0) {
    debugLog(`fetchAllData errors: ${JSON.stringify(errors)}`)
  }
  return { ok: true, ...results }
}

// ── 创建窗口 ───────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 260,
    height: 320,
    minWidth: 220,
    minHeight: 240,
    maxHeight: 460,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    transparent: true,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, 'renderer.html'))
  win.once('ready-to-show', () => {
    win.show()
    // 构造函数 visibleOnAllWorkspaces/alwaysOnTop 在部分 macOS 版本不生效，需显式调用
    win.setVisibleOnAllWorkspaces(true)
    win.setAlwaysOnTop(true, 'floating')
  })
  win.on('closed', () => { win = null })
}

// ── 托盘 ───────────────────────────────────────
let summaryData = null

function buildTrayTooltip(result) {
  if (!result) return 'NewApiBar'
  const root = result.userInfo?.data?.data ?? result.userInfo?.data
  const quota = root?.quota
  if (quota == null) return 'NewApiBar'
  const balance = (quota / 500000).toFixed(2)
  let tip = 'Balance: ¥' + balance
  if (result.logs?.ok) {
    const items = result.logs.data?.data?.items ?? []
    let totalQuota = 0
    for (const e of items) {
      totalQuota += (e.quota || 0)
    }
    if (totalQuota > 0) {
      tip += ' | Today: ¥' + (totalQuota / 500000).toFixed(2)
    }
  }
  return tip
}

function buildTrayMenu(result) {
  if (!tray) return
  summaryData = result
  tray.setToolTip(buildTrayTooltip(result))
}

function showTrayPopup() {
  if (!tray) return
  const menuItems = [{ label: 'NewApiBar', enabled: false }]

  if (summaryData) {
    const root = summaryData.userInfo?.data?.data ?? summaryData.userInfo?.data
    const quota = root?.quota
    menuItems.push({ type: 'separator' })
    menuItems.push({ label: '余额  ¥' + (quota / 500000).toFixed(2), enabled: false })

    if (summaryData.logs?.ok) {
      const items = summaryData.logs.data?.data?.items ?? []
      let totalQuota = 0
      const models = {}
      for (const e of items) {
        totalQuota += (e.quota || 0)
        const m = e.model_name || 'unknown'
        models[m] = (models[m] || 0) + (e.quota || 0)
      }
      menuItems.push({ label: '今日消耗  ¥' + (totalQuota / 500000).toFixed(2), enabled: false })
      menuItems.push({ type: 'separator' })
      const top5 = Object.entries(models).sort((a, b) => b[1] - a[1]).slice(0, 5)
      for (let i = 0; i < top5.length; i++) {
        menuItems.push({ label: `${i + 1}. ${top5[i][0].substring(0, 20)}  ¥${(top5[i][1] / 500000).toFixed(2)}`, enabled: false })
      }
    }
  } else {
    menuItems.push({ type: 'separator' })
    menuItems.push({ label: '暂无数据，请登录后刷新', enabled: false })
  }

  menuItems.push({ type: 'separator' })
  menuItems.push({ label: '刷新数据', click: () => { if (win) win.webContents.send('widget-refresh') } })
  menuItems.push({ label: '显示窗口', click: () => { if (win) win.show() } })

  // 打开控制台：使用已保存的域名
  const cfg = loadConfig()
  if (cfg.apiBase) {
    menuItems.push({ label: '打开控制台', click: () => shell.openExternal(cfg.apiBase + '/console') })
  }

  menuItems.push({ label: '设置…', click: () => { if (win) { win.show(); win.webContents.send('widget-show-settings') } } })
  menuItems.push({ type: 'separator' })
  menuItems.push({ label: '退出', click: () => { clearInterval(refreshTimer); app.quit() } })

  tray.popUpContextMenu(Menu.buildFromTemplate(menuItems))
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromNamedImage('NSStatusAvailable').resize({ width: 18, height: 18 }))
  } catch {
    tray = new Tray('/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/FinderIcon.icns')
  }
  tray.setToolTip('NewApiBar')
  tray.on('click', showTrayPopup)
}

// ── 自动刷新 ───────────────────────────────────
function startAutoRefresh() {
  clearInterval(refreshTimer)
  const cfg = loadConfig()
  const min = Math.max(1, Math.min(30, parseInt(cfg.interval) || 1))
  refreshTimer = setInterval(() => {
    if (win) win.webContents.send('widget-refresh')
  }, min * 60000)
}

// ── IPC ──────────────────────────────────────────
ipcMain.handle('fetch-data', async () => {
  const cfg = loadConfig()
  const apiBase = cfg.apiBase || ''
  const result = await fetchAllData(apiBase, cfg)
  if (tray) buildTrayMenu(result)
  return result
})

ipcMain.handle('do-login', async (_, { domain, username, password }) => {
  const apiBase = normalizeBase(domain)
  if (!apiBase) return { ok: false, error: '请输入有效的 API 域名' }

  const result = await login(apiBase, username, password)
  if (result.ok) {
    const cfg = loadConfig()
    cfg.apiBase = apiBase
    if (result.cookies) cfg.cookies = result.cookies
    if (result.token) cfg.token = result.token
    cfg.username = result.apiUser || username
    cfg.apiUser = result.apiUser || String(username)
    saveConfig(cfg)
    startAutoRefresh()
    debugLog(`SAVED config: apiBase=${cfg.apiBase} hasCookies=${!!cfg.cookies} username=${cfg.username}`)
  }
  return result
})

ipcMain.handle('save-domain', async (_, { domain }) => {
  const apiBase = normalizeBase(domain)
  if (!apiBase) return { ok: false, error: '请输入有效的 API 域名' }
  const cfg = loadConfig()
  cfg.apiBase = apiBase
  saveConfig(cfg)
  debugLog(`Domain saved: ${apiBase}`)
  return { ok: true, apiBase }
})

ipcMain.handle('load-config', async () => {
  const cfg = loadConfig()
  return {
    apiBase: cfg.apiBase || '',
    username: cfg.username || cfg.apiUser || '',
    hasAuth: !!(cfg.cookies || cfg.token),
    interval: cfg.interval || 1,
    theme: cfg.theme || 'dark',
    opacity: cfg.opacity ?? 80
  }
})

ipcMain.handle('set-refresh-interval', async (_, min) => {
  const cfg = loadConfig()
  cfg.interval = Math.max(1, Math.min(30, parseInt(min) || 1))
  saveConfig(cfg)
  startAutoRefresh()
  return { ok: true }
})

ipcMain.handle('logout', async () => {
  const cfg = loadConfig()
  delete cfg.cookies
  delete cfg.token
  delete cfg.username
  delete cfg.apiUser
  // 保留 apiBase，方便重新登录
  saveConfig(cfg)
  return { ok: true }
})

ipcMain.on('widget-hide', () => { if (win) win.hide() })
ipcMain.on('widget-show', () => { if (win) win.show() })

ipcMain.handle('set-pin', (_, pinned) => {
  if (win) {
    win.setVisibleOnAllWorkspaces(pinned)
    // macOS 需要指定 mode 才能正确置顶
    win.setAlwaysOnTop(pinned, 'floating')
    debugLog(`set-pin: ${pinned}`)
  }
  return { ok: true }
})

ipcMain.handle('resize-window', (_, width, height) => {
  if (win) win.setSize(Math.round(width), Math.round(height), false)
  return { ok: true }
})

ipcMain.handle('save-theme', (_, theme) => {
  const cfg = loadConfig()
  cfg.theme = theme
  saveConfig(cfg)
  return { ok: true }
})

ipcMain.handle('save-opacity', (_, opacity) => {
  try {
    const cfg = loadConfig()
    cfg.opacity = opacity
    saveConfig(cfg)
    debugLog(`Opacity saved: ${opacity}`)
    return { ok: true }
  } catch (e) {
    debugLog(`Opacity save failed: ${e.message}`)
    return { ok: false, error: e.message }
  }
})

// ── App 生命周期 ───────────────────────────────
app.whenReady().then(() => {
  createTray()
  createWindow()
  const cfg = loadConfig()
  if (cfg.cookies || cfg.token) startAutoRefresh()
})
