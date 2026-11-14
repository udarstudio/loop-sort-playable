import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';

const outputDirectory = 'dist/applovin';
const maxBytes = 5_000_000;

const result = await build({
  base: './',
  publicDir: false,
  build: {
    write: false,
    modulePreload: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap(({ output }) => output);
const page = outputs.find((file) => file.type === 'asset' && file.fileName === 'index.html');
const stylesheet = outputs.find((file) => file.type === 'asset' && file.fileName.endsWith('.css'));
const script = outputs.find((file) => file.type === 'chunk' && file.isEntry);

if (outputs.length !== 3 || !page || !stylesheet || !script || script.imports.length
    || script.dynamicImports.some((file) => file !== script.fileName)) {
  throw new Error('Expected one HTML page, one stylesheet, and one bundled script.');
}

const html = page.source.toString();
const scriptTag = `<script type="module" crossorigin src="./${script.fileName}"></script>`;
const styleTag = `<link rel="stylesheet" crossorigin href="./${stylesheet.fileName}">`;
if (!html.includes(scriptTag) || !html.includes(styleTag)) {
  throw new Error('Could not find the generated script and stylesheet tags.');
}

const standalone = html
  .replace(scriptTag, () => `<script type="module">${script.code.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(styleTag, () => `<style>${stylesheet.source.toString()}</style>`);

const size = Buffer.byteLength(standalone);
if (size > maxBytes) throw new Error(`AppLovin HTML is ${size} bytes and exceeds the ${maxBytes}-byte limit.`);

const outputPath = `${outputDirectory}/index.html`;
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, standalone);
console.log(`AppLovin HTML: ${outputPath} (${(size / 1_000_000).toFixed(2)} MB)`);
