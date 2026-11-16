// 与（本地或已部署的）mock 沙箱通信的薄封装。
// 服务地址统一由 utils/config.js 管理：开发默认 127.0.0.1，真机可换局域网 IP，上线换 HTTPS 域名。
// 本项目不连接任何真实打卡系统。
const config = require('./config')

function baseUrl() {
  return config.getBaseUrl()
}

function setBaseUrl(url) {
  return config.setBaseUrl(url)
}

function request(path, method, data, header) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: baseUrl() + path,
      method: method || 'GET',
      data: data || {},
      header: Object.assign({ 'content-type': 'application/json' }, header || {}),
      timeout: 8000,
      success: function (res) {
        const body = res.data || {}
        if (res.statusCode >= 400) {
          const err = new Error(body.message || body.error || ('HTTP ' + res.statusCode))
          err.statusCode = res.statusCode
          err.body = body
          reject(err)
        } else {
          resolve(body)
        }
      },
      fail: function (e) {
        reject(new Error('连不上沙箱 ' + baseUrl() + '：' + (e.errMsg || '请先启动 run.bat')))
      }
    })
  })
}

module.exports = {
  baseUrl: baseUrl,
  setBaseUrl: setBaseUrl,
  request: request,
  getConfig: function () { return request('/api/config') },
  getState: function () { return request('/api/state') },
  getSubmissions: function () { return request('/api/submissions') },
  setMode: function (mode) { return request('/api/mode', 'POST', { mode: mode }) },
  reset: function () { return request('/api/reset', 'POST', {}) },
  login: function (studentId) { return request('/api/login', 'POST', { student_id: studentId || '' }) },
  nonce: function (token) { return request('/api/nonce', 'POST', { token: token }) },
  classCode: function (secret) {
    return request('/api/class-code', 'POST', {}, { 'X-Classroom-Secret': secret })
  },
  sign: function (payload) { return request('/api/sign', 'POST', payload) }
}
