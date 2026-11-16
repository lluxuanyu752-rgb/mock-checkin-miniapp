// 学生端：仿「群报数」表单，但提交目标只有本机沙箱。
const api = require('../../utils/api')
const lab = require('../../utils/lab')
const photo = require('../../utils/photo')

Page({
  data: {
    ready: false,
    error: '',
    names: [],
    roster: [],
    nameIdx: 0,
    studentId: '',
    scenes: {},
    sceneIdx: 0,
    sceneLabels: [],
    lat: 0,
    lng: 0,
    locText: '未定位',
    cameraOn: false,
    photoPath: '',
    wmText: '',
    feature: null,
    takenMs: 0,
    classCode: '',
    mode: 'vulnerable',
    busy: false,
    result: null
  },

  onLoad() {
    this.boot()
  },

  // 教师端改过服务器地址后，回到学生端要重新拉配置（页面生命周期 onShow）。
  onShow() {
    const cur = api.baseUrl()
    if (this.loadedBase && this.loadedBase !== cur) {
      this.setData({ ready: false, error: '', result: null })
      this.boot()
    }
  },

  onReady() {
    this.cameraCtx = wx.createCameraContext()
  },

  async boot() {
    try {
      const cfg = await api.getConfig()
      const roster = cfg.roster || []
      const names = roster.map(function (s) { return s.name + '（' + s.student_id + '）' })
      let idx = 0
      roster.forEach(function (s, i) { if (s.student_id === cfg.demo_identity) idx = i })
      const demo = roster[idx] || roster[0]
      await lab.ensureSession(demo.student_id)
      this.cfg = cfg
      this.loadedBase = api.baseUrl()
      this.setData({
        ready: true,
        roster: roster,
        names: names,
        nameIdx: idx,
        studentId: demo.student_id,
        scenes: cfg.scenes,
        sceneLabels: ['查寝（' + cfg.scenes.dorm.name + '）', '上课（' + cfg.scenes.class.name + '）'],
        mode: cfg.mode
      })
      this.useSandboxLocation()
    } catch (e) {
      this.setData({ error: e.message })
    }
  },

  onNameChange(e) {
    const idx = Number(e.detail.value)
    const stu = this.data.roster[idx]
    if (!stu) return
    this.setData({ nameIdx: idx, studentId: stu.student_id, photoPath: '', wmText: '', feature: null })
    lab.ensureSession(stu.student_id).catch(function (err) {
      wx.showToast({ title: err.message, icon: 'none' })
    })
  },

  onSceneChange(e) {
    this.setData({ sceneIdx: Number(e.detail.value) })
    if (this.data.locText.indexOf('靶场') === 0) this.useSandboxLocation()
  },

  sceneKey() {
    return this.data.sceneIdx === 0 ? 'dorm' : 'class'
  },

  sceneInfo() {
    return (this.data.scenes || {})[this.sceneKey()] || {}
  },

  useSandboxLocation() {
    const s = this.sceneInfo()
    if (!s || !s.lat) return
    this.setData({ lat: s.lat, lng: s.lng, locText: '靶场坐标（模拟定位，本人未移动）' })
  },

  getRealLocation() {
    const self = this
    wx.getLocation({
      type: 'gcj02',
      success: function (r) {
        self.setData({ lat: r.latitude, lng: r.longitude, locText: '真实定位（当前手机位置）' })
      },
      fail: function (e) {
        self.setData({ locText: '真实定位失败：' + (e.errMsg || '未知错误') })
      }
    })
  },

  openCamera() {
    this.setData({ cameraOn: true, result: null })
  },

  cancelCamera() {
    this.setData({ cameraOn: false })
  },

  takePhoto() {
    const self = this
    if (!this.cameraCtx) this.cameraCtx = wx.createCameraContext()
    wx.showLoading({ title: '合成水印中…' })
    this.cameraCtx.takePhoto({
      quality: 'high',
      success: function (res) {
        self.composePhoto(res.tempImagePath)
      },
      fail: function (e) {
        wx.hideLoading()
        self.setData({ result: { ok: false, text: '拍照失败：' + (e.errMsg || '') + '\n开发者工具的模拟器没有摄像头，可以改用下方「模拟拍照」。' } })
      }
    })
  },

  // 开发者工具模拟器没有摄像头：用画布合成一张「仿拍摄」水印图（不含任何真实照片），
  // 只用于在电脑上跑通演示流程；真机演示请用上面的相机拍照。
  async mockPhoto() {
    wx.showLoading({ title: '生成演示图…' })
    try {
      const stu = this.data.roster[this.data.nameIdx] || {}
      const scene = this.sceneInfo()
      const wm = lab.watermark(stu.name, scene.name, this.data.lat, this.data.lng)
      const seed = (Date.now() % 997) + 1
      const out = await photo.synthetic(this, '#photoCanvas', wm, seed)
      const feature = await photo.featureOf(this, '#thumb', out.path, 0)
      this.setData({
        photoPath: out.path,
        wmText: wm,
        feature: feature,
        takenMs: Date.now(),
        cameraOn: false
      })
    } catch (e) {
      this.setData({ result: { ok: false, text: '生成演示图失败：' + e.message } })
    } finally {
      wx.hideLoading()
    }
  },

  async composePhoto(src) {
    try {
      const stu = this.data.roster[this.data.nameIdx] || {}
      const scene = this.sceneInfo()
      const wm = lab.watermark(stu.name, scene.name, this.data.lat, this.data.lng)
      const out = await photo.compose(this, '#photoCanvas', src, wm)
      const feature = await photo.featureOf(this, '#thumb', out.path, 0)
      this.setData({
        photoPath: out.path,
        wmText: wm,
        feature: feature,
        takenMs: Date.now(),
        cameraOn: false
      })
    } catch (e) {
      this.setData({ result: { ok: false, text: '水印合成失败：' + e.message } })
    } finally {
      wx.hideLoading()
    }
  },

  onCodeInput(e) {
    this.setData({ classCode: e.detail.value })
  },

  async submit() {
    if (this.data.busy) return
    if (!this.data.feature) {
      this.setData({ result: { ok: false, text: '请先拍照生成水印照片' } })
      return
    }
    this.setData({ busy: true, result: null })
    try {
      const st = await api.getState().catch(function () { return null })
      if (st && st.mode) this.setData({ mode: st.mode })
      let session = getApp().globalData.session
      if (!session) session = await lab.ensureSession(this.data.studentId)
      const r = await lab.sign({
        session: session,
        scene: this.sceneKey(),
        lat: this.data.lat,
        lng: this.data.lng,
        classCode: this.data.classCode,
        feature: this.data.feature,
        source: 'camera',
        takenMs: this.data.takenMs,
        wmText: this.data.wmText,
        claimed: this.data.studentId
      })
      const head = r.ok ? '签到成功' : '签到失败'
      const body = r.ok ? (r.message || '') : r.reasons.join('；')
      const dist = typeof r.dist_m === 'number' ? '\n距目标约 ' + Math.round(r.dist_m) + ' 米' : ''
      this.setData({ result: { ok: r.ok, text: head + '：' + body + dist } })
    } catch (e) {
      this.setData({ result: { ok: false, text: '提交失败：' + e.message } })
    } finally {
      this.setData({ busy: false })
    }
  }
})
