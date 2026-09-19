import { cp, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src');
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'vendor'), { recursive: true });
await cp(source, output, {
  recursive: true,
  filter: path => !path.startsWith(resolve(source, 'vendor'))
});

const vendorFiles = [
  ['node_modules/cytoscape/dist/cytoscape.min.js', 'vendor/cytoscape.min.js'],
  ['node_modules/dagre/dist/dagre.min.js', 'vendor/dagre.min.js'],
  ['node_modules/cytoscape-dagre/dist/cytoscape-dagre.min.js', 'vendor/cytoscape-dagre.js'],
  ['node_modules/@viz-js/viz/dist/viz-global.js', 'vendor/viz-global.js']
];

for (const [from, to] of vendorFiles) {
  await copyFile(resolve(root, from), resolve(output, to));
}

await writeFile(resolve(output, '.nojekyll'), '');
console.log(`Built static site in ${output}`);
