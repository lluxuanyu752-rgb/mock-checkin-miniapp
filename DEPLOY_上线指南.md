# 从本地靶场变成「真正的微信小程序」

这份指南回答两件事：

1. 你发的官方框架文档（ developers.weixin.qq.com/miniprogram/dev/framework/ ）对工程的要求，本工程逐条对应在哪（第 1 节）；
2. 接下来怎么把 `D:\dsh-output\mock-checkin-miniapp\` 变成能装进微信、能在手机上看的小程序，以及哪些地方一定会卡住（第 2–11 节）。

---

## 0. 两条必须先接受的前提

1. **上线后连的是你自己的后端。** 本项目连的是你在第 4 节部署的 mock 沙箱，不是群报数。它不会、也不能替你向群报数提交签到——那需要群报数后台接口 + 你的微信登录态，属于未授权访问，不在我们做的范围内。花名册是 32 个占位学生，照片默认用合成图。
2. **微信平台不允许「代打卡/刷课」类功能。** 运营规范里代签、作弊类功能会被拒审甚至封号。所以「真的小程序」有两条路：
   - **比赛/课堂演示**：不公开发布，用「体验版」+ 评委/同学扫码看（风险最低，推荐）；
   - **公开发布**：必须把定位改成「网络安全教学演示」，去掉真实学校名和真实学生信息，并在介绍里写明是攻防演示、不提供代签到服务。审核仍有较大被拒概率，不要把它当成稳定方案。

---

## 1. 框架文档要求 ↔ 本工程对应

| 文档章节 | 框架要求 | 本工程对应 |
| --- | --- | --- |
| 起步 / 申请账号 | 注册小程序账号、拿到 AppID | 现在用测试号 `touristappid`；第 3 节换真实 AppID |
| 起步 / 第一个小程序 | 用开发者工具导入、编译、预览 | 导入项目根目录 `D:\dsh-output\mock-checkin-miniapp\` |
| 代码构成 | `.json` 配置 + `.wxml` 结构 + `.wxss` 样式 + `.js` 逻辑 | 三个页面均为四件套 |
| 目录结构 | `app.json` / `app.js` / `app.wxss` + `pages/` + 自定义模块 | 已符合，公共能力在 `utils/` |
| 小程序配置（全局） | `app.json`：pages / window / tabBar / networkTimeout / permission … | 本轮补全 `app.json` |
| 小程序配置（页面） | 页面 `.json` 覆盖标题等 | `pages/*/*.json` 各自设置了 `navigationBarTitleText` 与 `usingComponents` |
| MINA 逻辑层 | `App()` / `Page()` 生命周期、`require` 模块化、API 回调/Promise | `app.js` 生命周期；`utils/*` 模块化；`api.js` 把 `wx.request` 包成 Promise |
| MINA 视图层 | 数据绑定 `{{}}`、`wx:for`、`wx:if`、`bindtap`/`bindinput` | 三个页面 wxml 全部使用 |
| WXSS | 尺寸单位 rpx、选择器、全局样式 | `app.wxss` + 页面 `.wxss` |
| 基础组件 | view / text / button / input / picker / camera / canvas / image | 全部用到 |
| 基础能力 / 网络 | request 合法域名：HTTPS、已备案、不能是 IP、端口仅 443；开发期可关校验 | `utils/config.js` 三套地址；第 5 节加白名单 |
| 基础能力 / 位置 | `wx.getLocation` 需权限声明 + 隐私指引 | `app.json` 的 `permission` + `requiredPrivateInfos`；第 7 节隐私指引 |
| 基础能力 / 相机 | `camera` 组件 + `createCameraContext` | 学生端拍照生成水印图 |
| 分包加载 / 按需注入 | 大工程分包；`lazyCodeLoading` | 工程小未分包；已开启 `lazyCodeLoading: requiredComponents` |
| 性能与体验 | 首屏快、避免大包 | 首屏只请求一个 `/api/config` |

---

## 2. 变成真小程序的 4 步闭环（最短路径）

1. 注册小程序 → 拿真实 AppID，替换 `project.config.json` 里的 `touristappid`。
2. 把 `server.py` 部署到公网 HTTPS（推荐云托管，第 4 节），拿到 `https://` 域名。
3. 小程序后台配好 **request 合法域名** + **用户隐私保护指引**（位置、相机）。
4. 开发者工具点「预览」→ 手机上看 → 上传体验版 → 评委扫码体验；要公开再走提审。

---

## 3. 注册与替换 AppID

1. 打开 <https://mp.weixin.qq.com> → 立即注册 → 选 **小程序**。个人主体可以注册（身份证 + 微信扫码验证）。
2. 名称不要用「群报数」或学校官方名，建议「打卡安全演示」「签到防伪演示」这类工具名。
3. 服务类目：选「工具」下不需要资质的类目（以后台可选列表为准），不要碰需要办学许可证的教育类目。
4. 后台「开发 → 开发设置」复制 **AppID**，替换 `project.config.json` 的 `"appid"`，并删掉 `"touristappid"`。
5. 同一页可重置 AppSecret；本 demo 用不到，不要泄露。
6. **备案**：小程序也需要 ICP 备案（公众平台会给入口，个人可备）。未备案无法正式发布；体验版一般不受影响，但以平台提示为准。

---

## 4. 后端部署：三个方案

### 方案 A：微信云托管 CloudRun（推荐，最省事）

`D:\dsh-output\mock-checkin\` 里已经放了 `Dockerfile`，`server.py` 也支持 `HOST` / `PORT` 环境变量。

1. 云托管控制台 → 新建服务 → 用 Dockerfile 构建，上传 `D:\dsh-output\mock-checkin\` 整个目录（含 `server.py`、`static/`、`Dockerfile`）。
2. 云托管会分配一个 `https://xxx-xxx.ap-shanghai.run.tcloudbase.com` 域名（平台域名，已备案，不用自己买域名）。
3. 环境变量设 `LAB_CLASSROOM_SECRET=你自己的密钥`（不要用 `TESTSEC1`），`HOST=0.0.0.0`，端口按平台要求（默认 8787）。
4. 把该 `https` 域名加入小程序 request 合法域名（第 5 节），并改 `utils/config.js` 的 `PRESETS.online`，或在教师端「服务器地址」卡直接填。
5. 容器是无状态的：`/api/reset` 清记录，容器重启也会清空——用于演示没问题。

本地先验证镜像：

```bash
docker build -t checkin-lab .
docker run -p 8787:8787 -e LAB_CLASSROOM_SECRET=TESTSEC1 -e HOST=0.0.0.0 checkin-lab
```

### 方案 B：云开发 CloudBase（云函数 + 数据库）

- 需要把 `server.py` 的接口改写成云函数（Node 或 Python 运行时），内存存储改成云数据库。
- 前端改用 `wx.cloud.callFunction`，不再走 `request`，也就不需要域名白名单。
- 改动量比方案 A 大（校验逻辑要搬一遍），但完全不用管 HTTPS 域名。

### 方案 C：自己的服务器 + 域名 + HTTPS

1. 买轻量服务器 + 域名并完成备案（通常 1–3 周）。
2. 上传 `mock-checkin`，这样启动：`HOST=0.0.0.0 PORT=8787 LAB_CLASSROOM_SECRET=xxx python server.py`。
3. 用 Caddy（自动申请证书）或 Nginx + certbot 反代到 8787。

Caddyfile：

```
checkin.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Nginx：

```
server {
    listen 443 ssl;
    server_name checkin.example.com;
    ssl_certificate     /etc/letsencrypt/live/checkin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/checkin.example.com/privkey.pem;
    location / { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; }
}
```

---

## 5. 配置 request 合法域名（关键，不配必失败）

小程序后台 → 开发 → 开发设置 → 服务器域名 → **request 合法域名**。

官方限制：HTTPS；域名已备案；**不能是 IP 地址**；不能带非 443 端口；每月有修改次数限制（文档写 50 次/月，以后台为准）。

- 填 `https://你的域名`（不带路径），例如 `https://checkin-lab.example.com`。
- 开发者工具里勾「不校验合法域名」只对开发/预览有效；**体验版、正式版一律走白名单**。
- 用云托管域名时，把那个具体域名加进去（不能填泛域名 `*`）。

---

## 6. 真机联调（不部署也能在手机上跑）

1. 手机和电脑连同一个 Wi-Fi。
2. 沙箱以 `HOST=0.0.0.0 PORT=8787 python server.py` 启动（或先设好环境变量再双击 `run.bat`）。
3. 电脑 `ipconfig` 查局域网 IP（如 `192.168.1.10`）。
4. 开发者工具「预览」→ 手机扫码 → 教师端「服务器地址」卡填 `http://192.168.1.10:8787` → 保存。
5. 设备端仍会报「不在以下 request 合法域名列表中」时：先在「详情 → 本地设置」勾选不校验合法域名再预览；部分机型/版本真机仍会拦，此时用内网穿透（ngrok / frp）拿一个临时 https 域名并加入白名单。
6. Windows 防火墙要放行 8787 入站。

---

## 7. 隐私保护指引（不做会被驳回）

小程序后台 → 设置 → 服务内容声明 → **用户隐私保护指引**：

- **位置信息**：用途写「仅用于本地靶场演示的定位校验，不上传至任何学校或真实打卡系统」。
- **摄像头/相册**：用途写「拍摄演示用水印照片」。
- `app.json` 已声明 `permission.scope.userLocation` 与 `requiredPrivateInfos: ["getLocation"]`；首次调用 `getLocation` 会弹授权框，拒绝后学生端会显示失败原因。
- 写清数据「存哪、存多久、给谁看」：本 demo 全部存在你自己服务器的内存里，重启即清空。

---

## 8. 发布流程（以后台为准）

开发者工具「上传」→ 填版本号与备注 → 后台「版本管理」：

- **体验版**：上传后在版本管理里设为体验版，加体验成员微信号，不用审核，适合比赛演示；
- **正式发布**：开发版本 → 提交审核（选类目、填页面截图、填功能说明）→ 通过 → 发布。

提审的功能说明建议写：「网络安全攻防教学演示，仅连接自建 mock 后端，不采集真实学生信息，不提供任何代签到服务」。

---

## 9. 会被拒 / 下架的点（务必避开）

- 代打卡、代签到、刷课、虚拟定位作弊——直接违规。
- 仿冒「群报数」或其他现有产品（名称、图标、界面高度雷同）。
- 未声明位置/相机权限，或隐私指引与实际行为不符。
- 需要办学资质的教育类目（个人主体基本拿不到）。
- 诱导分享、收集与功能无关的个人信息（真实姓名、学号、人脸）。

---

## 10. 代码改动清单（上线时只动这几处）

| 文件 | 改什么 |
| --- | --- |
| `project.config.json` | `"appid": "touristappid"` → 你的真实 AppID |
| `utils/config.js` | `PRESETS.online` 改成你的 https 域名（也可在教师端直接填） |
| `server.py` / `Dockerfile` | 部署时设 `HOST=0.0.0.0`、`PORT`、`LAB_CLASSROOM_SECRET` |
| 小程序后台 | request 合法域名、隐私保护指引、服务类目 |
| 若公开上架 | 去掉「群报数」字样、真实校名，改成「演示靶场」 |
| 全部 | 只用占位数据；不要上传真实同学姓名/学号/照片 |

---

## 11. 上线前自查清单

- [ ] AppID 已替换，开发者工具编译无报错
- [ ] 后端 https 地址能 `curl /api/config` 通
- [ ] request 合法域名已加，体验版请求不报「不在合法域名列表」
- [ ] 隐私指引已填位置 + 相机
- [ ] 体验版能跑通 8 个攻击场景
- [ ] 没有真实学生信息，没有「代打卡」宣传文案

> 只是比赛演示的话，最稳的路线是：**不发布、用体验版 + 本地沙箱**，现场连投影演示，既满足「真的微信小程序」，又不碰审核和合规风险。
