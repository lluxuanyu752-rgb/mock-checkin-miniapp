#!/usr/bin/env node
/**
 * 联调冒烟：检查"小程序要连的沙箱"是否可达、接口形状是否符合页面预期。
 * 不启动微信开发者工具，只发 HTTP 请求。
 *
 * 前置：沙箱已运行（D:\dsh-output\mock-checkin\run.bat），且 HOST=0.0.0.0（真机联调需要）。
 * 用法（在 mock-checkin-miniapp 目录下）:
 *     node tools/smoke.mjs
 *     node tools/smoke.mjs --secret TESTSEC1
 *     node tools/smoke.mjs --lan 172.20.10.7
 *
 * 退出码: 0=全部通过，1=有失败项
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];

function pass(name, detail = '') {
  console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
  fails.push(name);
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// 从 utils/config.js 里读局域网 IP（避免手工同步）
function readLanIp() {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'config.js'), 'utf8');
  const m = src.match(/LAN_IP\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
}

async function getJson(base, p, opts = {}) {
  const res = await fetch(base + p, { ...opts, signal: AbortSignal.timeout(5000) });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: res.status, body };
}

const SECRET = arg('secret', process.env.LAB_CLASSROOM_SECRET || 'TESTSEC1');
const LAN_IP = arg('lan', readLanIp());

console.log('== mock-checkin-miniapp 联调冒烟 ==');
console.log(`  配置里的局域网 IP: ${LAN_IP || '(未读到)'}`);

// 1. 本机沙箱
let localOk = false;
try {
  const r = await getJson('http://127.0.0.1:8787', '/api/config');
  const roster = r.body.roster || [];
  if (r.status === 200 && roster.length === 32) {
    localOk = true;
    pass('本机沙箱可达 127.0.0.1:8787', `模式=${r.body.mode} 花名册=${roster.length} 人`);
    // 页面依赖的字段
    const need = ['scenes', 'roster', 'demo_identity', 'code_rotate_seconds', 'watermark_ttl_ms', 'mode'];
    const missing = need.filter((k) => !(k in r.body));
    missing.length ? fail('/api/config 字段齐全', '缺: ' + missing.join(', ')) : pass('/api/config 字段齐全（页面依赖项）');
    const ids = new Set(roster.map((s) => s.student_id));
    ids.has(r.body.demo_identity)
      ? pass('demo_identity 在花名册中', r.body.demo_identity)
      : fail('demo_identity 在花名册中', r.body.demo_identity);
  } else {
    fail('本机沙箱可达 127.0.0.1:8787', `status=${r.status}`);
  }
} catch (e) {
  fail('本机沙箱可达 127.0.0.1:8787', e.message + '（先启动 run.bat）');
}

// 2. 局域网地址（真机要用的那个）
if (LAN_IP) {
  try {
    const r = await getJson(`http://${LAN_IP}:8787`, '/api/config');
    r.status === 200
      ? pass(`局域网沙箱可达 http://${LAN_IP}:8787`, '真机联调用这个地址')
      : fail(`局域网沙箱可达 http://${LAN_IP}:8787`, `status=${r.status}`);
  } catch (e) {
    fail(`局域网沙箱可达 http://${LAN_IP}:8787`, e.message + '（检查：服务是否 HOST=0.0.0.0、防火墙、手机与电脑同一网络）');
  }
} else {
  fail('能从 utils/config.js 读到 LAN_IP');
}

// 3. 教师端密钥（真机/模拟器上教师端连接会用到）
if (localOk) {
  try {
    const r = await getJson('http://127.0.0.1:8787', '/api/class-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Classroom-Secret': SECRET },
      body: '{}',
    });
    if (r.status === 200 && /^[0-9A-F]{6}$/i.test(String(r.body.code || ''))) {
      pass('教师端密钥可用', `动态码 ${r.body.code}（${SECRET}）`);
    } else {
      fail('教师端密钥可用', `status=${r.status} body=${JSON.stringify(r.body)}`);
    }
  } catch (e) {
    fail('教师端密钥可用', e.message);
  }
}

console.log('-'.repeat(40));
console.log('提示: 换网络后要同步改 utils/config.js 的 LAN_IP → Ctrl+B 重新编译 → 重新生成真机调试二维码。');
if (fails.length) {
  console.log(`结果: ${fails.length} 项失败`);
  process.exit(1);
}
console.log('结果: 全部通过');
