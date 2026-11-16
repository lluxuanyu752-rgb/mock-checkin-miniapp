#!/usr/bin/env node
/**
 * 静态自检：不用打开微信开发者工具，检查小程序工程"没有明显写坏"。
 *
 * 用法（在 mock-checkin-miniapp 目录下）:
 *     node tools/check.mjs
 *
 * 检查项:
 *   1. 所有 .js 语法（用 node --check 逐个检查）
 *   2. 所有 .json 可解析
 *   3. app.json: pages 四件套齐全 / tabBar 指向已注册页面 /
 *      requiredPrivateInfos 含 getLocation / 定位描述不超过 30 字（超过会被真机报 80058）
 *   4. WXML 里 bind / catch 事件处理函数都能在对应页面 js 里找到
 *   5. 代码里 require('...') 的相对路径都存在
 *   6. project.config.json 的 appid 提示（touristappid 无法 cli open）
 * 退出码: 0=全部通过，1=有失败项
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'miniprogram_npm', '.git', '.idea', 'typings']);
const fails = [];
const warns = [];

function pass(name, detail = '') {
  console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(name, detail = '') {
  console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
  fails.push(name);
}
function warn(name, detail = '') {
  console.log(`  [WARN] ${name}${detail ? ' — ' + detail : ''}`);
  warns.push(name);
}
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out);
    } else {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

console.log('== mock-checkin-miniapp 静态自检 ==');
const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// 1. JS 语法
const jsFiles = files.filter((f) => f.endsWith('.js'));
let jsFail = 0;
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    jsFail++;
    fail(`JS 语法: ${rel(f)}`, (r.stderr || '').split('\n')[0]);
  }
}
if (!jsFail) pass(`JS 语法（${jsFiles.length} 个文件）`);

// 2. JSON 可解析
const jsonFiles = files.filter((f) => f.endsWith('.json'));
let jsonFail = 0;
const jsonCache = new Map();
for (const f of jsonFiles) {
  try {
    jsonCache.set(f, JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (e) {
    jsonFail++;
    fail(`JSON 解析: ${rel(f)}`, e.message);
  }
}
if (!jsonFail) pass(`JSON 可解析（${jsonFiles.length} 个文件）`);

// 3. app.json 规范
const appJsonPath = path.join(ROOT, 'app.json');
if (!jsonCache.has(appJsonPath)) {
  fail('app.json 存在且可解析');
} else {
  const app = jsonCache.get(appJsonPath);
  const pages = app.pages || [];
  let missing = [];
  for (const p of pages) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(path.join(ROOT, p + ext))) missing.push(p + ext);
    }
  }
  missing.length ? fail('pages 四件套齐全', '缺: ' + missing.join(', ')) : pass(`pages 四件套齐全（${pages.length} 页）`);

  const tabs = (app.tabBar && app.tabBar.list) || [];
  const badTabs = tabs.map((t) => t.pagePath).filter((p) => !pages.includes(p));
  badTabs.length ? fail('tabBar 指向已注册页面', '未注册: ' + badTabs.join(', ')) : pass(`tabBar 指向已注册页面（${tabs.length} 项）`);

  const rpi = app.requiredPrivateInfos || [];
  rpi.includes('getLocation') ? pass('requiredPrivateInfos 含 getLocation') : fail('requiredPrivateInfos 含 getLocation');

  const desc = app.permission && app.permission['scope.userLocation'] && app.permission['scope.userLocation'].desc;
  if (!desc) fail('定位用途描述存在');
  else if ([...desc].length > 30) fail(`定位用途描述长度 <= 30（当前 ${[...desc].length} 字）`);
  else pass(`定位用途描述长度合法（${[...desc].length} 字）`);

  app.lazyCodeLoading ? pass('lazyCodeLoading 已配置') : warn('lazyCodeLoading 未配置');
  app.networkTimeout ? pass('networkTimeout 已配置') : warn('networkTimeout 未配置');
}

// 4. WXML 事件绑定 ↔ 页面 JS
const pagesDir = path.join(ROOT, 'pages');
if (fs.existsSync(pagesDir)) {
  let bindChecked = 0;
  let bindFail = 0;
  for (const page of fs.readdirSync(pagesDir)) {
    const dir = path.join(pagesDir, page);
    if (!fs.statSync(dir).isDirectory()) continue;
    const wxml = path.join(dir, `${page}.wxml`);
    const js = path.join(dir, `${page}.js`);
    if (!fs.existsSync(wxml) || !fs.existsSync(js)) continue;
    const wxmlSrc = fs.readFileSync(wxml, 'utf8');
    const jsSrc = fs.readFileSync(js, 'utf8');
    const handlers = new Set();
    for (const m of wxmlSrc.matchAll(/(?:bind|catch)[a-zA-Z]*="([A-Za-z_$][\w$]*)"/g)) handlers.add(m[1]);
    const missing = [...handlers].filter((h) => !new RegExp(`(^|[^\\w$])${h}\\s*\\(`).test(jsSrc));
    bindChecked += handlers.size;
    if (missing.length) {
      bindFail++;
      fail(`${page} 事件处理函数存在`, '缺: ' + missing.join(', '));
    }
  }
  if (!bindFail) pass(`WXML 事件处理函数齐全（${bindChecked} 个绑定）`);
}

// 5. require 相对路径
let reqFail = 0;
for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    const candidates = [target, target + '.js', path.join(target, 'index.js')];
    if (!candidates.some((c) => fs.existsSync(c))) {
      reqFail++;
      fail(`require 路径存在: ${rel(f)} -> ${m[1]}`);
    }
  }
}
if (!reqFail) pass('require 相对路径都存在');

// 6. appid 提示
const projCfg = jsonCache.get(path.join(ROOT, 'project.config.json'));
if (projCfg) {
  const appid = projCfg.appid || '';
  if (!appid || appid === 'touristappid') warn('project.config.json 的 appid 是游客号，cli open 会报 code 10', appid);
  else pass(`appid 已配置（${appid}）`);
}

console.log('-'.repeat(40));
if (fails.length) {
  console.log(`结果: ${fails.length} 项失败${warns.length ? `，${warns.length} 项警告` : ''}`);
  process.exit(1);
}
console.log(`结果: 全部通过${warns.length ? `（${warns.length} 项警告）` : ''}`);
