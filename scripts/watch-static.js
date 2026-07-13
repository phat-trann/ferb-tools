const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const staticDir = path.join(rootDir, 'static');
const distDir = path.join(rootDir, 'dist');

function copyStatic() {
  fs.mkdirSync(distDir, { recursive: true });
  execFileSync('cp', ['-R', `${staticDir}/.`, distDir], { stdio: 'inherit' });
  console.log(`[static] copied ${new Date().toLocaleTimeString()}`);
}

copyStatic();

let timer = null;
fs.watch(staticDir, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(copyStatic, 80);
});

console.log('[static] watching static/');
