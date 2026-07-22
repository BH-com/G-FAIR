const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const required = ['index.html', 'admin.html', 'app.js', 'styles.css', 'xlsx-grid.js'];
let failed = false;

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`누락: ${file}`);
    failed = true;
  }
}

for (const file of walk(root).filter((p) => p.endsWith('.js') && !p.endsWith('jszip.min.js'))) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (error) {
    console.error(`구문 오류: ${path.relative(root, file)}\n${error.message}`);
    failed = true;
  }
}

for (const htmlName of ['index.html', 'admin.html']) {
  const htmlPath = path.join(root, htmlName);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const src of scripts) {
    if (!fs.existsSync(path.join(root, src))) {
      console.error(`${htmlName} 스크립트 누락: ${src}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('FINDER 정적 무결성 검사 통과');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
