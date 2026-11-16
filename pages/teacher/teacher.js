// 教师端：模拟教室/宿舍楼上的轮换动态码设备 + 查看提交记录 + 切换服务器地址。
const api = require('../../utils/api')
const config = require('../../utils/config')

const SCENE_LABEL = { dorm: '查寝', class: '上课' }

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function fmtTime(ms) {
  const d = new Date(ms)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

Page({
  data: {
    baseUrl: '',
    baseInput: '',
    secret: '',
    connected: false,
    err: '',
    code: '',
    secLeft: 0,
    mode: '',
    rows: [],
    total: 0
  },

  onLoad() {
    const base = api.baseUrl()
    this.setData({ baseUrl: base, baseInput: base })
    try {
      const s = wx.getStorageSync('labSecret')
      if (s) this.setData({ secret: s })
    } catch (e) {}
  },

  onBaseInput(e) {
    this.setData({ baseInput: e.detail.value })
  },

  pickPreset(e) {
    const key = e.currentTarget.dataset.key
    if (config.PRESETS[key]) this.setData({ baseInput: config.PRESETS[key] })
  },

  // 改服务器地址：开发连本机、真机连电脑局域网 IP、上线连 HTTPS 域名。
  saveBase() {
    const v = api.setBaseUrl(this.data.baseInput)
    this.setData({ baseUrl: v, baseInput: v })
    wx.showToast({ title: '地址已保存', icon: 'none' })
    if (this.data.connected) {
      this.stop()
      this.setData({ connected: false, code: '', err: '' })
      this.connect()
    }
  },

  onShow() {
    if (this.data.connected) this.start()
  },

  onHide() { this.stop() },
  onUnload() { this.stop() },

  onSecretInput(e) {
    this.setData({ secret: e.detail.value })
  },

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (this.tick) { clearInterval(this.tick); this.tick = null }
  },

  start() {
    this.stop()
    const self = this
    this.tick = setInterval(function () {
      const left = self.data.secLeft > 0 ? self.data.secLeft - 1 : 0
      self.setData({ secLeft: left })
    }, 1000)
    this.poll()
    this.timer = setInterval(function () { self.poll() }, 2000)
  },

  async connect() {
    const secret = this.data.secret.trim()
    if (!secret) {
      this.setData({ err: '先填教室端密钥（run.bat 启动时控制台打印，默认 TESTSEC1）' })
      return
    }
    try {
      await api.classCode(secret)
      try { wx.setStorageSync('labSecret', secret) } catch (e) {}
      this.setData({ connected: true, err: '' })
      this.start()
    } catch (e) {
      this.stop()
      this.setData({ connected: false, err: e.message, mode: '' })
    }
  },

  async poll() {
    try {
      const c = await api.classCode(this.data.secret.trim())
      const subs = await api.getSubmissions()
      const rows = (subs.rows || []).slice(0, 20).map(function (r) {
        return Object.assign({}, r, {
          time: fmtTime(r.at_ms),
          sceneLabel: SCENE_LABEL[r.scene] || r.scene,
          dist: (r.dist_m === null || r.dist_m === undefined) ? '-' : Math.round(r.dist_m) + ' 米',
          result: r.ok ? '成功' : '拦截',
          reasonText: (r.reasons || []).join('；'),
          src: r.source || '-'
        })
      })
      this.setData({ code: c.code, secLeft: Math.round(c.ttl_ms / 1000), mode: subs.mode, rows: rows, err: '' })
    } catch (e) {
      this.stop()
      this.setData({ connected: false, err: e.message })
    }
  },

  async switchMode(e) {
    const m = e.currentTarget.dataset.mode
    try {
      await api.setMode(m)
      this.setData({ mode: m })
      wx.showToast({ title: m === 'hardened' ? '已切到加固模式' : '已切到漏洞模式', icon: 'none' })
    } catch (err) {
      this.setData({ err: err.message })
    }
  },

  async reset() {
    try {
      await api.reset()
      this.setData({ rows: [] })
      this.poll()
      wx.showToast({ title: '记录已清空', icon: 'none' })
    } catch (e) {
      this.setData({ err: e.message })
    }
  }
})
