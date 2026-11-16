// 攻击演示：8 个用例全部只请求本机 127.0.0.1 沙箱，图片是合成的色块图，不含任何真实照片。
const api = require('../../utils/api')
const lab = require('../../utils/lab')
const photo = require('../../utils/photo')

const CASES = [
  { key: 'vuln_far', name: '① 异地坐标 · 漏洞模式', desc: '人在北京，把教室坐标直接写进请求' },
  { key: 'hard_far', name: '② 异地坐标 · 加固模式', desc: '同一请求，服务端算距离后拒绝' },
  { key: 'hard_code', name: '③ 坐标对 · 动态码错', desc: '围栏骗得过，现场动态码骗不过' },
  { key: 'vuln_other', name: '④ 替同学签到 · 漏洞模式', desc: '换 claimed_student_id 顶替别人' },
  { key: 'hard_other', name: '⑤ 替同学签到 · 加固模式', desc: '服务端把请求绑定到会话身份' },
  { key: 'hard_dup', name: '⑥ 同一张照片重传 · 加固', desc: '第一次成功，第二次相似度去重拦住' },
  { key: 'hard_album', name: '⑦ 相册旧图冒充相机 · 加固', desc: 'photo_meta.source=album 被识破' },
  { key: 'hard_replay', name: '⑧ 重放同一请求 · 加固', desc: 'nonce 一次性，重放被拒' }
]

Page({
  data: {
    cases: CASES.map(function (c) { return { key: c.key, name: c.name, desc: c.desc, text: '未运行', state: '' } }),
    running: '',
    secret: '',
    code: '',
    codeErr: '',
    photoPath: '',
    err: ''
  },

  onLoad() {
    this.photos = {}
    try {
      const s = wx.getStorageSync('labSecret')
      if (s) {
        this.setData({ secret: s })
        this.loadCode()
      }
    } catch (e) {}
  },

  onSecretInput(e) {
    this.setData({ secret: e.detail.value })
  },

  async loadCode() {
    const secret = (this.data.secret || '').trim()
    if (!secret) {
      this.setData({ code: '', codeErr: '先填教师端密钥' })
      return
    }
    try {
      const c = await api.classCode(secret)
      this.setData({ code: c.code, codeErr: '' })
      try { wx.setStorageSync('labSecret', secret) } catch (e) {}
    } catch (e) {
      this.setData({ code: '', codeErr: e.message })
    }
  },

  setCase(key, text, state) {
    const cases = this.data.cases.map(function (c) {
      if (c.key !== key) return c
      return { key: c.key, name: c.name, desc: c.desc, text: text, state: state || 'done' }
    })
    this.setData({ cases: cases })
  },

  async prep() {
    const cfg = await api.getConfig()
    const roster = cfg.roster || []
    let demo = roster[0]
    roster.forEach(function (s) { if (s.student_id === cfg.demo_identity) demo = s })
    const other = roster.filter(function (s) { return s.student_id !== demo.student_id })[0] || demo
    const session = await lab.ensureSession(demo.student_id)
    let code = ''
    const secret = (this.data.secret || '').trim()
    if (secret) {
      try { code = (await api.classCode(secret)).code } catch (e) {}
    }
    return { cfg: cfg, demo: demo, other: other, session: session, scene: cfg.scenes.dorm, code: code }
  },

  async photoFor(key, p) {
    if (this.photos && this.photos[key]) return this.photos[key]
    const seed = key.split('').reduce(function (a, c) { return a + c.charCodeAt(0) }, 0)
    const wm = lab.watermark(p.demo.name, p.scene.name, p.scene.lat, p.scene.lng)
    const out = await photo.synthetic(this, '#atkCanvas', wm, seed)
    const feature = await photo.featureOf(this, '#thumb', out.path, 0)
    this.photos = this.photos || {}
    this.photos[key] = { path: out.path, feature: feature, wm: wm }
    this.setData({ photoPath: out.path })
    return this.photos[key]
  },

  async runCase(e) {
    const key = e.currentTarget.dataset.key
    if (this.data.running) return
    this.setCase(key, '运行中…', 'run')
    this.setData({ running: key, err: '' })
    let text = ''
    try {
      const p = await this.prep()
      const img = await this.photoFor(key, p)
      const base = {
        session: p.session,
        scene: 'dorm',
        lat: p.scene.lat,
        lng: p.scene.lng,
        classCode: p.code,
        feature: img.feature,
        source: 'camera',
        takenMs: Date.now(),
        wmText: img.wm,
        claimed: p.demo.student_id
      }
      const noCode = p.code ? '' : '（没拿到动态码：先在「学生端」用教师端密钥取一次码）'
      if (key === 'vuln_far') {
        await api.setMode('vulnerable')
        const r = await lab.sign(Object.assign({}, base, { lat: 39.9042, lng: 116.4074, classCode: '' }))
        text = '结果：' + lab.short(r)
      } else if (key === 'hard_far') {
        await api.setMode('hardened')
        const r = await lab.sign(base)
        text = '结果：' + lab.short(r) + noCode
      } else if (key === 'hard_code') {
        await api.setMode('hardened')
        const r = await lab.sign(Object.assign({}, base, { classCode: '000000' }))
        text = '结果：' + lab.short(r)
      } else if (key === 'vuln_other') {
        await api.setMode('vulnerable')
        const r = await lab.sign(Object.assign({}, base, {
          claimed: p.other.student_id,
          wmText: lab.watermark(p.other.name, p.scene.name, p.scene.lat, p.scene.lng)
        }))
        text = r.ok ? '结果：成功（漏洞模式连替签都记成功）' : '结果：' + lab.short(r)
      } else if (key === 'hard_other') {
        await api.setMode('hardened')
        const r = await lab.sign(Object.assign({}, base, {
          claimed: p.other.student_id,
          wmText: lab.watermark(p.other.name, p.scene.name, p.scene.lat, p.scene.lng)
        }))
        text = '结果：' + lab.short(r) + noCode
      } else if (key === 'hard_dup') {
        await api.setMode('hardened')
        const first = await lab.sign(base)
        if (!first.ok) {
          text = '前置合法签到失败：' + first.reasons.join('；') + noCode
        } else {
          const second = await lab.sign(Object.assign({}, base, { takenMs: Date.now() }))
          text = '第一次成功；同一张图立刻重传 → ' + lab.short(second)
        }
      } else if (key === 'hard_album') {
        await api.setMode('hardened')
        const r = await lab.sign(Object.assign({}, base, { source: 'album' }))
        text = '结果：' + lab.short(r) + noCode
      } else if (key === 'hard_replay') {
        await api.setMode('hardened')
        const nonce = (await api.nonce(p.session.token)).nonce
        const first = await lab.sign(Object.assign({}, base, { nonce: nonce }))
        if (!first.ok) {
          text = '前置合法签到失败：' + first.reasons.join('；') + noCode
        } else {
          const second = await lab.sign(Object.assign({}, base, { nonce: nonce }))
          text = '第一次成功；重放同一 nonce → ' + lab.short(second)
        }
      } else {
        text = '未知用例'
      }
    } catch (err) {
      text = '执行出错：' + (err.message || err)
    }
    this.setCase(key, text)
    this.setData({ running: '' })
  }
})
