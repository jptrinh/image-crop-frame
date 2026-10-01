// Standalone test page for the component, outside WeWeb: stubs wwLib, mounts the element with a reactive `content`.
// Run: npm run harness, then serve dev/harness (python3 -m http.server 8765 --directory dev/harness) and open
// index.html. In the console: `content` (change any property), `__events` (trigger events), `__ctx` (local context),
// `__var` (internal variable). Uses @vue/compiler-sfc, sass and esbuild, which come with @weweb/cli.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'out');
const require = createRequire(path.join(root, 'package.json'));
const { parse, compileScript, compileStyle, compileTemplate } = require('@vue/compiler-sfc');
const sass = require('sass');
const esbuild = require('esbuild');

fs.mkdirSync(out, { recursive: true });
const { descriptor, errors } = parse(fs.readFileSync(path.join(root, 'src/wwElement.vue'), 'utf8'), {
    filename: 'wwElement.vue',
});
if (errors.length) throw errors[0];
// A classic <script> (not <script setup>): the template is compiled apart and attached as the render function
const script = compileScript(descriptor, { id: 'icf' });
fs.writeFileSync(path.join(out, 'wwElement.script.js'), script.content.replace(/from '\.\//g, "from '../../../src/"));
const template = compileTemplate({
    source: descriptor.template.content,
    filename: 'wwElement.vue',
    id: 'icf',
    compilerOptions: { bindingMetadata: script.bindings },
});
if (template.errors.length) throw template.errors[0];
fs.writeFileSync(path.join(out, 'wwElement.template.js'), template.code);
// SCSS compiled by sass, scoping dropped (one component on the page)
const css = descriptor.styles
    .map(style => compileStyle({ source: sass.compileString(style.content).css, filename: 'x.vue', id: 'icf' }).code)
    .join('\n');
fs.writeFileSync(path.join(out, 'style.css'), css);
await esbuild.build({
    entryPoints: [path.join(here, 'entry.js')],
    bundle: true,
    outfile: path.join(out, 'bundle.js'),
    format: 'iife',
    alias: { vue: path.join(root, 'node_modules/vue/dist/vue.esm-browser.js') },
});
console.log('harness built in dev/harness/out');
