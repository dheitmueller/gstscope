import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SAMPLE_CATALOG } from '../src/sample-catalog.js';

const required = [
  'index.html',
  'app.js',
  'sample-catalog.js',
  'geometry.js',
  'styles.css',
  'vendor/cytoscape.min.js',
  'vendor/dagre.min.js',
  'vendor/cytoscape-dagre.js',
  'vendor/viz-global.js',
  '.nojekyll'
];

if (SAMPLE_CATALOG.length !== 10) {
  throw new Error(`Expected exactly 10 bundled samples, found ${SAMPLE_CATALOG.length}`);
}

for (const sample of SAMPLE_CATALOG) {
  for (const field of ['id', 'label', 'author', 'source', 'license', 'description']) {
    if (!sample[field]) throw new Error(`Sample ${sample.id || '<unknown>'} is missing ${field}`);
  }
  if (!/GPL-2\.0-or-later/.test(sample.license)) {
    throw new Error(`Sample ${sample.id} is not marked GPL-2.0-or-later compatible`);
  }
  if (!sample.generated) required.push(`samples/${sample.file}`);
}

await Promise.all(required.map(file => access(resolve('dist', file))));

const html = await readFile(resolve('dist/index.html'), 'utf8');
const rootRelativeAsset = /(?:src|href)=["']\/(?!\/)/;
if (rootRelativeAsset.test(html)) {
  throw new Error('index.html contains a root-relative asset URL that will break on GitHub project Pages');
}

console.log('Validated static build and GitHub Pages-relative asset paths');
