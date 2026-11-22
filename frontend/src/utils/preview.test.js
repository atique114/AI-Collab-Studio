import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePreviewFiles } from './preview.js'

function readFile(tree, path) {
  let cursor = tree
  const parts = path.split('/')
  for (const part of parts.slice(0, -1)) cursor = cursor[part].directory
  return cursor?.[parts.at(-1)]?.file?.contents
}

test('prepares a React file for preview without changing the saved project tree', () => {
  const project = {
    'app.jsx': { file: { contents: 'export default function App() { return null }' } },
  }

  const preview = preparePreviewFiles(project)
  const manifest = JSON.parse(readFile(preview, 'package.json'))

  assert.equal(readFile(project, 'package.json'), undefined)
  assert.equal(manifest.scripts.start, 'vite --host 0.0.0.0')
  assert.ok(manifest.dependencies.react)
  assert.match(readFile(preview, 'index.html'), /src="\/src\/main\.jsx"/)
  assert.match(readFile(preview, 'src/main.jsx'), /from '\.\.\/app\.jsx'/)
})

test('uses a standalone design.html as the preview entry point', () => {
  const project = {
    'design.html': { file: { contents: '<h1>Design</h1>' } },
  }

  const preview = preparePreviewFiles(project)

  assert.equal(readFile(preview, 'index.html'), '<h1>Design</h1>')
  assert.equal(readFile(project, 'index.html'), undefined)
})

test('preserves an existing dev script and adds the preview start command', () => {
  const project = {
    'package.json': { file: { contents: JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { react: '^18.3.1' } }) } },
    'index.html': { file: { contents: '<div id="root"></div>' } },
  }

  const preview = preparePreviewFiles(project)
  const manifest = JSON.parse(readFile(preview, 'package.json'))

  assert.equal(manifest.scripts.dev, 'vite')
  assert.equal(manifest.scripts.start, 'npm run dev -- --host 0.0.0.0')
  assert.equal(manifest.dependencies.react, '^18.3.1')
})

test('reports an invalid project package.json clearly', () => {
  const project = { 'package.json': { file: { contents: '{broken' } } }

  assert.throws(() => preparePreviewFiles(project), /package\.json is not valid JSON/i)
})
