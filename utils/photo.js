// 画布工具：把照片合成水印图 / 生成 16 维「感知特征」。
// 说明：特征算法是演示用的简化版（4x4 平均灰度），服务端只要拿到 16 个数就能做相似度去重。

function pick(page, selector) {
  return new Promise(function (resolve, reject) {
    wx.createSelectorQuery()
      .in(page)
      .select(selector)
      .fields({ node: true, size: true })
      .exec(function (res) {
        const r = res && res[0]
        if (!r || !r.node) {
          reject(new Error('画布未就绪：' + selector))
          return
        }
        let dpr = 1
        try {
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          dpr = info.pixelRatio || 1
        } catch (e) {}
        resolve({
          canvas: r.node,
          ctx: r.node.getContext('2d'),
          dpr: dpr,
          width: Math.max(1, Math.round(r.width || 1)),
          height: Math.max(1, Math.round(r.height || 1))
        })
      })
  })
}

function loadImage(canvas, src) {
  return new Promise(function (resolve, reject) {
    const img = canvas.createImage()
    img.onload = function () { resolve(img) }
    img.onerror = function () { reject(new Error('图片加载失败')) }
    img.src = src
  })
}

function drawWatermark(ctx, width, height, text) {
  const lines = String(text || '').split('\n')
  const barH = 30 + lines.length * 22
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, height - barH, width, barH)
  ctx.fillStyle = '#ffffff'
  ctx.font = '13px sans-serif'
  lines.forEach(function (line, i) {
    ctx.fillText(line, 12, height - barH + 22 + i * 20)
  })
}

function exportCanvas(canvas, width, height) {
  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0,
      y: 0,
      width: width,
      height: height,
      destWidth: Math.round(width * 2),
      destHeight: Math.round(height * 2),
      fileType: 'jpg',
      quality: 0.9,
      success: function (res) { resolve(res.tempFilePath) },
      fail: function (e) { reject(new Error('导出图片失败：' + (e.errMsg || ''))) }
    })
  })
}

// 把真实拍摄/选择的图片画到画布上，并在底部加时间地点水印
async function compose(page, selector, src, wmText) {
  const c = await pick(page, selector)
  c.canvas.width = Math.round(c.width * c.dpr)
  c.canvas.height = Math.round(c.height * c.dpr)
  const ctx = c.ctx
  ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0)
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, c.width, c.height)
  const img = await loadImage(c.canvas, src)
  const scale = Math.max(c.width / img.width, c.height / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh)
  drawWatermark(ctx, c.width, c.height, wmText)
  const path = await exportCanvas(c.canvas, c.width, c.height)
  return { path: path, width: c.width, height: c.height }
}

// 合成一张「仿教室/寝室」的水印图：纯色块 + 渐变，不包含任何真实照片。
// seed 用来让每次生成的图不同，便于演示「同图重传」外的场景。
async function synthetic(page, selector, wmText, seed) {
  const c = await pick(page, selector)
  c.canvas.width = Math.round(c.width * c.dpr)
  c.canvas.height = Math.round(c.height * c.dpr)
  const ctx = c.ctx
  ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0)
  const s = Number(seed) || 1
  const r = 30 + (s * 37) % 110
  const g = 30 + (s * 61) % 110
  const b = 30 + (s * 89) % 110
  if (ctx.createLinearGradient) {
    const grad = ctx.createLinearGradient(0, 0, c.width, c.height)
    grad.addColorStop(0, 'rgb(' + r + ',' + g + ',' + b + ')')
    grad.addColorStop(1, 'rgb(' + Math.min(255, r + 100) + ',' + Math.min(255, g + 70) + ',' + Math.min(255, b + 40) + ')')
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'
  }
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
  for (let i = 0; i < 4; i++) {
    const w = 60 + (s * (i + 3) * 13) % 110
    const h = 40 + (s * (i + 5) * 17) % 70
    const x = 20 + (s * 23 + i * 70) % Math.max(1, c.width - w - 40)
    const y = 30 + (s * 31 + i * 55) % Math.max(1, c.height - h - 140)
    ctx.fillRect(x, y, w, h)
  }
  drawWatermark(ctx, c.width, c.height, wmText)
  const path = await exportCanvas(c.canvas, c.width, c.height)
  return { path: path, width: c.width, height: c.height }
}

function hashFeature(src) {
  const s = String(src || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let x = h >>> 0
  const out = []
  for (let i = 0; i < 16; i++) {
    x = (Math.imul(x ^ (x >>> 13), 1274126177) >>> 0)
    out.push(20 + (x % 200))
  }
  return out
}

// 16 维特征：图片缩到 16x16，按 4x4 分块取平均灰度
// noise 是人为扰动，用来模拟「同一张图重新压缩/加噪」后再提交
async function featureOf(page, selector, src, noise) {
  try {
    const c = await pick(page, selector)
    c.canvas.width = 16
    c.canvas.height = 16
    const ctx = c.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, 16, 16)
    const img = await loadImage(c.canvas, src)
    ctx.drawImage(img, 0, 0, 16, 16)
    if (!ctx.getImageData) return hashFeature(src)
    const data = ctx.getImageData(0, 0, 16, 16).data
    const feat = []
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        let sum = 0
        let n = 0
        for (let y = gy * 4; y < gy * 4 + 4; y++) {
          for (let x = gx * 4; x < gx * 4 + 4; x++) {
            const i = (y * 16 + x) * 4
            sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
            n++
          }
        }
        feat.push(sum / n)
      }
    }
    const amt = Number(noise) || 0
    if (!amt) return feat
    return feat.map(function (v, i) {
      return Math.max(0, v + amt * (((i * 7) % 5) - 2) / 2)
    })
  } catch (e) {
    return hashFeature(src)
  }
}

module.exports = {
  pick: pick,
  compose: compose,
  synthetic: synthetic,
  featureOf: featureOf,
  hashFeature: hashFeature
}
