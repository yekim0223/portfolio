// index.html → portfolio_standalone.html  (단일 파일 / 이미지 base64 임베드)
//
// 설계 원칙: "보이는 이미지는 JS 없이도 무조건 뜬다" (카카오톡 인앱·메일·일부 채용사이트 등
//   JS 처리가 제한되는 환경에서도 안 깨지도록 썸네일을 HTML src에 직접 임베드)
//
//  - 썸네일(HTML .promo-thumb img, 이중따옴표 ./capture): 작은 해상도(max 560px·JPEG q72) 직접 임베드
//  - 라이트박스(JS galleries, 단일따옴표 ./capture): 고화질(max 1400px·JPEG q82) 임베드
//  - 로고(HTML ./image/logo): PNG 투명도 유지(max 320px)
//  - 외부 리소스(Google Fonts, 뉴스 링크)는 그대로 유지(정상 동작)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'index.html';
const OUT = 'portfolio_standalone.html';

async function encode(rel, { maxW, quality, forcePng }) {
  const file = path.normalize(rel);
  const ext = path.extname(file).toLowerCase();
  const img = sharp(file, { failOn: 'none' });
  const meta = await img.metadata();
  let pipe = img;
  if (meta.width && meta.width > maxW) pipe = pipe.resize({ width: maxW });
  let buf, mime;
  if (forcePng && (ext === '.png' || meta.hasAlpha)) {
    buf = await pipe.png({ compressionLevel: 9, palette: true }).toBuffer();
    mime = 'image/png';
  } else {
    buf = await pipe.jpeg({ quality, mozjpeg: true }).toBuffer();
    mime = 'image/jpeg';
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

(async () => {
  let html = fs.readFileSync(SRC, 'utf8');
  const cache = new Map(); // key: variant|rel
  let logoN = 0, thumbN = 0, fullN = 0, encBytes = 0;
  const missing = [];

  async function get(rel, variant, opts) {
    const key = variant + '|' + rel;
    if (cache.has(key)) return cache.get(key);
    const file = path.normalize(rel);
    if (!fs.existsSync(file)) { missing.push(rel); return null; }
    const uri = await encode(rel, opts);
    cache.set(key, uri); encBytes += uri.length;
    return uri;
  }

  // (A) 로고: HTML 이중따옴표 ./image/... → 임베드(PNG 유지)
  const logoRefs = [...new Set([...html.matchAll(/"(\.\/image\/[^"]+)"/g)].map(m => m[1]))];
  for (const rel of logoRefs) {
    const uri = await get(rel, 'logo', { maxW: 320, quality: 85, forcePng: true });
    if (uri) { html = html.split(`"${rel}"`).join(`"${uri}"`); logoN++; }
  }

  // (B) 라이트박스: JS 단일따옴표 ./capture/... → 고화질 임베드
  const fullRefs = [...new Set([...html.matchAll(/'(\.\/capture\/[^']+)'/g)].map(m => m[1]))];
  for (const rel of fullRefs) {
    const uri = await get(rel, 'full', { maxW: 1400, quality: 82, forcePng: false });
    if (uri) { html = html.split(`'${rel}'`).join(`'${uri}'`); fullN++; }
  }

  // (C) 썸네일: HTML 이중따옴표 ./capture/... → 소형 임베드(직접 src, JS 비의존)
  const thumbRefs = [...new Set([...html.matchAll(/"(\.\/capture\/[^"]+)"/g)].map(m => m[1]))];
  for (const rel of thumbRefs) {
    const uri = await get(rel, 'thumb', { maxW: 560, quality: 72, forcePng: false });
    if (uri) { html = html.split(`"${rel}"`).join(`"${uri}"`); thumbN++; }
  }

  fs.writeFileSync(OUT, html);
  const leftover = [...html.matchAll(/['"]\.\/(?:image|capture)\/[^'"]+['"]/g)].map(x => x[0]);

  console.log(`로고 ${logoN} | 라이트박스(고화질) ${fullN} | 썸네일(소형) ${thumbN}`);
  console.log(`인코딩 합계(base64) ${(encBytes/1024/1024).toFixed(2)}MB`);
  console.log(`누락 ${missing.length}` + (missing.length ? '\n  - ' + [...new Set(missing)].join('\n  - ') : ''));
  console.log(`잔존 로컬경로 ${leftover.length}` + (leftover.length ? '\n  - ' + leftover.join('\n  - ') : ''));
  console.log(`출력: ${OUT} (${(fs.statSync(OUT).size/1024/1024).toFixed(2)} MB)`);
})();
