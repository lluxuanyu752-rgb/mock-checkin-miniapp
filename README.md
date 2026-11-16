# 打卡签到漏洞靶场 · 微信小程序版（本地）

这是一个**只连本机沙箱**的微信小程序工程，用来在「微信开发者工具 / 真机」里演示同一个签到流程的两种实现：

- **漏洞版**（服务端明文信任客户端）：改个坐标、换张旧图、替别人点一下，全都能签成功；
- **加固版**（服务端逐项校验）：同样的操作逐项被拦，并给出拦截原因。

它不是真实打卡系统的客户端，也**不会**连接「群报数」或任何学校线上系统：所有请求只发往 `http://127.0.0.1:8787`，也就是 `D:\dsh-output\mock-checkin\` 里的那个本地服务。图片是程序合成的色块图，不含任何真实照片。

---

## 一、先启动沙箱

双击 **`D:\dsh-output\mock-checkin\run.bat`**（或 `run.ps1`），控制台会打印：

```
[沙箱] 监听 http://127.0.0.1:8787/
[沙箱] 教师端密钥（教室动态码设备用）：TESTSEC1
```

把这个密钥记下来，小程序「教师端」要填它。不开沙箱，小程序三页都会提示「连不上沙箱」。

## 二、导入小程序

1. 打开**微信开发者工具** → 导入项目 → 目录选 `D:\dsh-output\mock-checkin-miniapp`。
2. AppID 选「**测试号**」（工程里写的是 `touristappid`，不需要真实 AppID，也不上传发布）。
3. 右上角「详情 → 本地设置」勾选：
   - **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
   - 使用 npm 模块：不用勾
4. 编译。tabBar 出现三项：**学生端 / 教师端 / 攻击演示**。

> `project.config.json` 里已经写了 `urlCheck: false`，但不同版本工具仍建议手动确认上面这一勾，否则请求 `127.0.0.1` 会被拦。

## 三、三个页面

### 1. 学生端（仿群报数表单）

| 真实群报数 | 本工程对应 |
| --- | --- |
| 学生姓名（分组 254205 下拉，不公开） | 32 人花名册下拉（学号 25420501–25420532，姓名「学生01」…） |
| 学号（8 位，自动填入） | 选姓名后自动带出，只读 |
| 定位（点按钮，需在某楼 100 米内） | 「靶场坐标」直接把目标坐标填进请求 / 「真实定位」走 `wx.getLocation` |
| 水印拍照打卡（强制手机相机） | `camera` 组件拍照 → canvas 合成「时间/地点/姓名/坐标」水印 |
| 提交 | 发到本机沙箱 `/api/sign` |

演示要点：先「靶场坐标」→ 拍照 → 去教师端看动态码填进来 → 提交。加固模式下会提示成功并显示距目标距离。

### 2. 教师端（教室动态码设备）

- 填密钥（`TESTSEC1`）连接，显示 **6 位动态码**，每 120 秒自动轮换，带倒计时；
- 切换服务端模式：**漏洞模式 / 加固模式**；
- 查看最近 20 条提交记录：时间、姓名、场景、成功/拦截、拦截原因、距目标距离、图片来源；
- 清空提交记录。

动态码是加固版的「现场在场证明」：它只显示在教室/寝室那台设备上，且 2 分钟换一次——远程的人拿不到。

### 3. 攻击演示（8 个用例，一键运行）

| 用例 | 期望结果 |
| --- | --- |
| ① 北京坐标 + 漏洞模式 | 成功（服务端没算距离） |
| ② 北京坐标 + 加固模式 | 拦截：不在签到范围（约 87 万米） |
| ③ 坐标对、动态码错 + 加固 | 拦截：现场动态码错误或已过期 |
| ④ 替同学签到 + 漏洞模式 | 成功（连替签都记成功） |
| ⑤ 替同学签到 + 加固模式 | 拦截：身份不符（疑似替他人签到） |
| ⑥ 同一张照片重传 + 加固 | 第一次成功，第二次拦截：照片高度相似 |
| ⑦ 相册旧图冒充相机 + 加固 | 拦截：图片来源不是相机 |
| ⑧ 重放同一请求 + 加固 | 拦截：nonce 已使用（重放） |

> ③ 是整场演示的关键一页：**坐标能骗、照片能骗，动态码骗不过**。所以真实系统的修复重点不是 GPS 围栏，而是「人在现场」的证明。

## 四、现场演示流程（约 5 分钟）

1. 教师端连接 → 大屏显示动态码（说明它 2 分钟一换）。
2. 学生端：靶场坐标 + 拍照 + 填动态码 → 提交成功 → 教师端记录出现「成功」。
3. 攻击演示 ①：北京坐标，漏洞模式 → 成功，记录标「异地（约 1067 公里）仍被记为成功」。这就是作弊成立的原因。
4. 攻击演示 ②：同一请求切加固 → 拦截，原因写「不在签到范围」。
5. 攻击演示 ③：坐标写对（说明围栏可绕）但动态码错 → 仍拦截。强调「靠的是动态码，不是 GPS」。
6. 攻击演示 ④⑤（替签）、⑥（照片复用）、⑦（相册旧图）、⑧（重放）→ 逐个被拦。
7. 回到教师端，把 6 条拦截原因连起来念一遍：这就是修复清单。

## 五、目录结构

```
mock-checkin-miniapp/
├─ project.config.json        工具配置（urlCheck:false，AppID）
├─ project.private.config.json 本地个人配置（已 gitignore，工具会自动生成）
├─ app.json / app.js / app.wxss   三 tab、全局配置与样式
├─ sitemap.json
├─ DEPLOY_上线指南.md          变成真小程序（AppID/HTTPS 部署/域名白名单/隐私/审核）
├─ tools/
│  ├─ check.mjs   静态自检（JS 语法、JSON、pages 四件套、WXML 事件绑定、require 路径、定位描述长度）
│  └─ smoke.mjs   联调冒烟（本机沙箱、局域网沙箱、教师端动态码是否都通）
├─ utils/
│  ├─ config.js   服务器地址（本机 / 局域网 / 线上三套预设 + 自定义）
│  ├─ api.js      请求封装（地址取自 config.js）
│  ├─ lab.js      会话/水印文案/签到请求组装与结果格式化
│  └─ photo.js    canvas 拍照合成水印、合成演示图、16 维图像特征
└─ pages/
   ├─ index/      学生端（仿群报数）
   ├─ teacher/    教师端（服务器地址、动态码、模式切换、提交记录）
   └─ attack/     攻击演示（8 用例）
```

## 六、已知限制（都是环境问题，不是漏洞）

- **真机连不上 127.0.0.1**：手机上的 `127.0.0.1` 是手机自己，所以真机走局域网 IP（`utils/config.js` 已按运行环境自动切换，见「七、服务器地址与真机调试」）。
- **开发者工具模拟器没有摄像头**：`camera` 组件会黑屏，拍照失败；真机正常。学生端为此提供了「**模拟拍照（开发者工具无摄像头时用）**」按钮：用画布合成一张带水印的占位图（不含任何真实照片），只为在电脑上跑通「拍照 → 提交 → 服务端记录」这条链路；真机演示仍用相机拍照。
- **AppID 说明**：`project.config.json` 里的 `wx0adffe015a446183` 是你本机已有工程的 AppID，只用于在开发者工具里打开/调试本工程，没有预览、没有上传、没有发布。
- 游客 AppID 只适合本地演示，不要上传发布。
- 沙箱是内存态，`run.bat` 重启后提交记录/会话/nonce 清空，模式回到漏洞模式。

## 七、服务器地址与真机调试（本机 / 局域网 / 线上）

地址统一在 `utils/config.js` 里管理，也可以在教师端第一张卡里直接改（保存在本地缓存）：

| 预设 | 值 | 用途 |
| --- | --- | --- |
| local | `http://127.0.0.1:8787` | 开发者工具 / 模拟器 |
| lan | `http://172.17.48.116:8787` | 真机调试（手机连同一 Wi-Fi，电脑的 WLAN IP） |
| online | `https://checkin-lab.example.com` | 部署到公网后的正式地址（必须 HTTPS） |

`utils/config.js` 会按运行环境自动选：开发者工具里用 `local`，**真机上第一次打开自动用 `lan`**，不用手动改地址；教师端「服务器地址」卡里填过的自定义地址优先级最高。

手机端跑起来的步骤：

1. 电脑：沙箱用 `HOST=0.0.0.0` 启动（`set HOST=0.0.0.0 && run.bat`，或命令行 `$env:HOST="0.0.0.0"` 后启动 `server.py`），监听 `0.0.0.0:8787`。本机 WLAN IP 已确认是 `172.17.48.116`（换网络就改 `utils/config.js` 里的 `LAN_IP` 或教师端地址卡）。
2. 手机：连和电脑**同一个 Wi-Fi**。
3. 开发者工具：点工具栏「**真机调试**」→ 生成二维码 → 微信扫码 → 手机会打开小程序（真机调试模式会沿用「不校验合法域名」，所以能直连 `http://172.17.48.116:8787`；**「预览」二维码会强制校验合法域名，连不上局域网 IP**，别用预览演示）。
4. 手机上先看学生端能不能拉到花名册（能拉到就说明网络通了）；然后教师端填 `TESTSEC1` 连接、学生端拍照/模拟拍照提交。
5. 想用「预览」二维码而不是真机调试，就必须把沙箱部署到 HTTPS 域名并配好 request 合法域名（见 `DEPLOY_上线指南.md`）。

防火墙：Windows Defender 已有 `python.exe` 的入站放行规则（Public 配置文件），局域网设备可以访问 8787；如果换端口/换解释器，要自己放行。

## 八、框架文档要求 ↔ 本工程

官方文档（`developers.weixin.qq.com/miniprogram/dev/framework/`）的关键要求，本工程逐条落地：

| 文档要求 | 落在哪 |
| --- | --- |
| `app.json` 全局配置：pages / window / tabBar / networkTimeout / permission | `app.json` |
| 页面四件套 + 页面 json | `pages/*/*.{js,wxml,wxss,json}` |
| `App()` / `Page()` 生命周期 | `app.js`（onLaunch/onShow/onHide/onError/onUnhandledRejection/onPageNotFound）、三页 onLoad/onShow/onHide/onUnload |
| 模块化 `require` / `module.exports` | `utils/api.js`、`utils/lab.js`、`utils/photo.js`、`utils/config.js` |
| 数据绑定 / 列表渲染 / 条件渲染 / 事件绑定 | 三页 `.wxml`（`{{}}`、`wx:for`、`wx:if`、`bindtap`/`bindinput`） |
| `request` 合法域名（HTTPS/备案/非 IP/443）、开发期可关校验 | `utils/config.js` + `project.config.json` 的 `urlCheck:false` |
| `wx.getLocation` 权限声明 + 隐私指引 | `app.json` 的 `permission` + `requiredPrivateInfos` |
| `camera` 组件 + `createCameraContext` | 学生端拍照 |
| 按需注入 `lazyCodeLoading` | `app.json` |

## 九、怎么变成「真正的微信小程序」

见 **[DEPLOY_上线指南.md](./DEPLOY_上线指南.md)**：注册真实 AppID → 把 `server.py` 部署成 HTTPS（推荐微信云托管，已带 Dockerfile）→ 配 request 合法域名与隐私指引 → 预览/体验版/提审。里面也写了审核会被拒的点（代打卡类功能不能公开上架）和「只做比赛演示」的最稳路线。

## 十、开发与自检（tools/）

改完代码、出二维码之前，先跑这两个脚本，能提前发现大部分"低级错误"：

```bat
chcp 65001
node tools\check.mjs                 :: 静态检查，不需要开发者工具
node tools\smoke.mjs --secret TESTSEC1   :: 需要沙箱已启动
```

- **`check.mjs`（静态，不联网）**
  - 所有 `.js` 用 `node --check` 过语法、所有 `.json` 能解析；
  - `app.json`：pages 四件套齐全、tabBar 指向已注册页、`requiredPrivateInfos` 含 `getLocation`、**定位用途描述 ≤ 30 字**（超了真机会报 `80058`）；
  - WXML 里 `bind*/catch*` 的处理函数都能在对应页面 js 里找到（这次演示就靠它避免"按钮点了没反应"）；
  - `require('./xxx')` 相对路径都存在；appid 是否还是游客号（游客号 `cli open` 会报 `code 10`）。
- **`smoke.mjs`（联调）**
  - 本机 `127.0.0.1:8787` 是否可达、`/api/config` 字段是否齐全（页面依赖项）、`demo_identity` 是否在花名册；
  - **从 `utils/config.js` 读出的局域网 IP** 是否可达（换网络后最容易忘的一步）；
  - 教师端密钥 `TESTSEC1` 能否取到 6 位动态码。

> 本机 PATH 上没有 node 时，用捆绑解释器：
> `C:\Users\ALIENWARE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe tools\check.mjs`

## 十一、用 git 管理

本目录是一个独立的 git 仓库（首次提交 `chore: 初始化仓库（小程序工程 + 自检脚本）`）：

```bat
git status
git log --oneline
git diff
```

- 本机没装独立 git，但 **GitHub Desktop 自带**：
  `C:\Users\ALIENWARE\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd\git.exe`（可临时用，或加进 PATH）。
- 已忽略：`node_modules/`、`miniprogram_npm/`、`typings/`、`project.private.config.json`（随机器生成，关键设置都在 `project.config.json` 里）、`*.log`、系统文件。
- 建议每次"换网络 / 改页面 / 改加固逻辑"后：`check.mjs` → `smoke.mjs` → 提交一次，出问题时能直接回滚。

## 十二、边界

- 只请求 `127.0.0.1` / 本机局域网，不连接「群报数」后台，不连接任何学校线上系统；
- 不伪造真实学生的姓名、学号、照片（花名册是占位数据，图片是程序合成）；
- 用途是安全教学：演示「为什么只靠客户端上报的签到拦不住作弊」以及对应的修复清单。
