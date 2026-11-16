// 本地攻防沙箱演示小程序：只连接你自己部署的 mock 服务，不连接任何真实打卡系统。
// 这里演示框架文档「逻辑层 / 注册小程序」里的 App() 与生命周期。
const api = require('./utils/api')

App({
  globalData: {
    config: null,
    session: null,
    lastBaseUrl: ''
  },

  onLaunch() {
    this.globalData.lastBaseUrl = api.baseUrl()
    console.log('[lab] 服务地址 =', this.globalData.lastBaseUrl)
  },

  onShow() {
    // 从教师端改过服务器地址后同步一下，方便排查「连不上」。
    const now = api.baseUrl()
    if (now !== this.globalData.lastBaseUrl) {
      this.globalData.lastBaseUrl = now
      console.log('[lab] 服务地址已切换 =', now)
    }
  },

  onHide() {
    console.log('[lab] 小程序进入后台')
  },

  onError(msg) {
    console.error('[lab] 未捕获错误：', msg)
  },

  onUnhandledRejection(res) {
    console.error('[lab] 未处理的 Promise 拒绝：', (res && res.reason) || res)
  },

  onPageNotFound(res) {
    console.warn('[lab] 页面不存在：', res && res.path)
    wx.switchTab({ url: '/pages/index/index' })
  }
})
