// 演示用的业务组合逻辑：登录会话 / 水印文案 / 提交签到。
const api = require('./api')

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

function watermark(name, sceneName, lat, lng) {
  const d = new Date()
  const day = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  const ll = Number(lat || 0).toFixed(6) + ',' + Number(lng || 0).toFixed(6)
  return day + ' ' + hm + '\n' + (sceneName || '') + ' ' + (name || '') + ' ' + ll
}

function ensureSession(studentId) {
  return api.login(studentId || '').then(function (s) {
    getApp().globalData.session = s
    return s
  })
}

function sign(opts) {
  const session = opts.session
  const payload = {
    scene: opts.scene || 'dorm',
    lat: opts.lat,
    lng: opts.lng,
    token: session.token,
    device_id: session.device_key,
    claimed_student_id: opts.claimed || session.student_id,
    class_code: opts.classCode || '',
    ts: Date.now(),
    photo_feature: opts.feature || [],
    photo_meta: {
      source: opts.source || 'camera',
      taken_ms: opts.takenMs || Date.now(),
      wm_text: opts.wmText || ''
    }
  }
  const noncePromise = opts.nonce
    ? Promise.resolve(opts.nonce)
    : api.nonce(session.token).then(function (n) { return n.nonce })
  return noncePromise.then(function (nonce) {
    payload.nonce = nonce
    return api.sign(payload)
  }).then(function (r) {
    return { ok: true, reasons: [], message: r.message || '', dist_m: r.dist_m, raw: r }
  }, function (e) {
    const body = e.body || {}
    const reasons = body.reasons && body.reasons.length ? body.reasons : [e.message]
    return { ok: false, reasons: reasons, message: body.message || e.message, dist_m: body.dist_m, raw: body }
  })
}

function short(r) {
  if (r.ok) {
    const dist = typeof r.dist_m === 'number' ? '（距目标 ' + Math.round(r.dist_m) + ' 米）' : ''
    return '成功' + dist
  }
  return '被拦截：' + r.reasons.join('；')
}

module.exports = {
  watermark: watermark,
  ensureSession: ensureSession,
  sign: sign,
  short: short
}
