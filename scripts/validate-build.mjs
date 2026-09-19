import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  'index.html',
  'app.js',
  'geometry.js',
  'styles.css',
  'samples/playbin3-hang.dot',
  'vendor/cytoscape.min.js',
  'vendor/dagre.min.js',
  'vendor/cytoscape-dagre.js',
  'vendor/viz-global.js',
  '.nojekyll'
];

await Promise.all(required.map(file => access(resolve('dist', file))));

const html = await readFile(resolve('dist/index.html'), 'utf8');
const rootRelativeAsset = /(?:src|href)=["']\/(?!\/)/;
if (rootRelativeAsset.test(html)) {
  throw new Error('index.html contains a root-relative asset URL that will break on GitHub project Pages');
}

console.log('Validated static build and GitHub Pages-relative asset paths');
