// 服务器地址配置。
// 微信小程序的网络限制（框架文档「基础能力 / 网络」）：
//   - 正式版 / 体验版只能请求在小程序后台配置过的「request 合法域名」；
//   - 合法域名必须是 HTTPS、已备案、不能是 IP 地址，端口只能是 443；
//   - 开发阶段可以勾选开发者工具「不校验合法域名」来请求 http://127.0.0.1 或局域网 IP。
// 所以这里预置三种典型环境，上线时把 online 改成你自己的 HTTPS 域名即可。
// 真机说明：手机上的 127.0.0.1 指向手机自己，所以真机要用电脑的局域网 IP（下面 LAN_IP）。
// 换网络时只改这一行（或用教师端「服务器地址」卡临时改），然后 Ctrl+B 重新编译 + 重新出真机调试二维码。
// 本机可能同时有多个地址，例如：WLAN 172.17.48.116 / 以太网 172.17.15.241 / iPhone 热点 172.20.10.7
//   - 手机连哪个网络，就填电脑在该网络里的地址；
//   - 用 ipconfig 查「IPv4 地址」，或看 mock-checkin 启动时的提示。
const LAN_IP = '172.17.48.116' // 本机当前局域网地址（2026-11-16 恢复默认 Wi-Fi）

const PRESETS = {
  local: 'http://127.0.0.1:8787', // 开发者工具 / 模拟器
  lan: 'http://' + LAN_IP + ':8787', // 真机 + 电脑同一 Wi-Fi
  online: 'https://checkin-lab.example.com' // 部署到 HTTPS 服务器后的正式地址
}

const KEY_PROFILE = 'labProfile'
const KEY_BASE = 'labBaseUrl'

function safeGet(key) {
  try { return wx.getStorageSync(key) } catch (e) { return '' }
}

function safeSet(key, value) {
  try { wx.setStorageSync(key, value) } catch (e) {}
}

// 是不是跑在开发者工具里（模拟器）。真机上 platform 是 ios / android / windows / mac。
function isDevtools() {
  try {
    const info = wx.getSystemInfoSync()
    return String(info.platform || '').toLowerCase() === 'devtools'
  } catch (e) {
    return true
  }
}

function getProfile() {
  const saved = safeGet(KEY_PROFILE)
  if (saved) return saved
  return isDevtools() ? 'local' : 'lan'
}

function setProfile(name) {
  if (!PRESETS[name]) return getProfile()
  safeSet(KEY_PROFILE, name)
  return name
}

// 优先使用「自定义地址」（教师端可改），否则用当前环境预设。
function getBaseUrl() {
  const custom = safeGet(KEY_BASE)
  if (custom) return String(custom).replace(/\/+$/, '')
  return PRESETS[getProfile()] || PRESETS.local
}

function setBaseUrl(url) {
  const v = String(url || '').trim().replace(/\/+$/, '')
  if (v) safeSet(KEY_BASE, v)
  else {
    try { wx.removeStorageSync(KEY_BASE) } catch (e) {}
  }
  return v || getBaseUrl()
}

function isLocalhost(url) {
  const u = String(url || '')
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(u)
}

function isHttps(url) {
  return /^https:\/\//i.test(String(url || ''))
}

module.exports = {
  PRESETS: PRESETS,
  LAN_IP: LAN_IP,
  isDevtools: isDevtools,
  getProfile: getProfile,
  setProfile: setProfile,
  getBaseUrl: getBaseUrl,
  setBaseUrl: setBaseUrl,
  isLocalhost: isLocalhost,
  isHttps: isHttps
}
