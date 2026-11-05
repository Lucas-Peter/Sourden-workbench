// 构建本地预览：把 preview-shim.js + public/app.js 内联进 public/preview.html
// 用法：node _wb-build-preview.mjs
// 说明：preview.html 的 <head>/<body> 骨架保持不变，重建 <style> 与两个 <script> 块
//       （<style> 同步自 public/style.css，否则预览的样式会和线上对不上）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const PREVIEW = join(root, 'public', 'preview.html');
const SHIM = join(root, 'preview-shim.js');
const APP = join(root, 'public', 'app.js');
const CSS = join(root, 'public', 'style.css');

const html = readFileSync(PREVIEW, 'utf8').replace(/\r\n/g, '\n');
const idx = html.indexOf('<script>');
if (idx < 0) throw new Error('preview.html 里找不到 <script> 锚点');

let head = html.slice(0, idx);
const css = readFileSync(CSS, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const s0 = head.indexOf('<style>'), s1 = head.indexOf('</style>');
if (s0 >= 0 && s1 > s0) head = head.slice(0, s0 + 7) + '\n' + css + '\n' + head.slice(s1);

const shim = readFileSync(SHIM, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const app = readFileSync(APP, 'utf8').replace(/\r\n/g, '\n').trimEnd();

const out = head
  + '<script>\n' + shim + '\n</script>\n'
  + '<script>\n' + app + '\n</script>\n'
  + '</body>\n</html>\n';

writeFileSync(PREVIEW, out, 'utf8');
console.log('preview.html 已重建：', out.length, '字节（含 CSS ' + css.length + ' 字节）');
