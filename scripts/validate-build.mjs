import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { GENERATED_SAMPLE_DOTS } from '../src/generated-samples.js';
import { SAMPLE_CATALOG } from '../src/sample-catalog.js';

const required = [
  'index.html',
  'app.js',
  'generated-samples.js',
  'sample-catalog.js',
  'geometry.js',
  'styles.css',
  'vendor/cytoscape.min.js',
  'vendor/dagre.min.js',
  'vendor/cytoscape-dagre.js',
  'vendor/cytoscape-navigator.js',
  'vendor/viz-global.js',
  '.nojekyll'
];

if (SAMPLE_CATALOG.length !== 15) {
  throw new Error(`Expected exactly 15 bundled samples, found ${SAMPLE_CATALOG.length}`);
}

for (const sample of SAMPLE_CATALOG) {
  for (const field of ['id', 'label', 'author', 'source', 'license', 'description']) {
    if (!sample[field]) throw new Error(`Sample ${sample.id || '<unknown>'} is missing ${field}`);
  }
  if (!/GPL-(?:2\.0|3\.0)-or-later/.test(sample.license)) {
    throw new Error(`Sample ${sample.id} is not marked with a GPL-compatible license`);
  }
  if (!sample.generated) {
    required.push(`samples/${sample.file}`);
    if (!GENERATED_SAMPLE_DOTS[sample.id]) throw new Error(`Sample ${sample.id} is missing from the embedded fixture bundle`);
  }
}

const upstreamHashes = new Map([
  ['gps-filesrc-video-audio.dot', '49a4626bf29d86b287f026bc37e0d3d761b8d253a074a90583bc9e837fbe53bb'],
  ['gps-big-buck-bunny.dot', '6d8616951197bac9a8b4940a1402ccacce9fed29996df8cb626d16b013c35664'],
  ['gps-jellyfish.dot', '4097827c87ddab7a3d1930f1e091a70446244cfcff190a0fcd8795334091b4ce']
]);
for (const [file, expected] of upstreamHashes) {
  const contents = await readFile(resolve('src/samples', file));
  const actual = createHash('sha256').update(contents).digest('hex');
  if (actual !== expected) throw new Error(`Third-party sample ${file} no longer matches its pinned upstream capture`);
}

await Promise.all(required.map(file => access(resolve('dist', file))));

const html = await readFile(resolve('dist/index.html'), 'utf8');
const rootRelativeAsset = /(?:src|href)=["']\/(?!\/)/;
if (rootRelativeAsset.test(html)) {
  throw new Error('index.html contains a root-relative asset URL that will break on GitHub project Pages');
}

console.log('Validated static build and GitHub Pages-relative asset paths');
