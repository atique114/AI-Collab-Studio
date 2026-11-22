import test from 'node:test'
import assert from 'node:assert/strict'
import { collectFilePaths, mergeFileTrees } from '../services/file-tree.service.js'

test('merges generated files without deleting existing project files', () => {
  const existing = {
    'src': { directory: {
      'App.jsx': { file: { contents: 'old app' } },
      'keep.txt': { file: { contents: 'keep this' } }
    } }
  }
  const generated = {
    'src': { directory: {
      'App.jsx': { file: { contents: 'updated app' } },
      'components': { directory: {
        'Card.jsx': { file: { contents: 'export default function Card() {}' } }
      } }
    } },
    'index.html': { file: { contents: '<main>Dashboard</main>' } }
  }

  const merged = mergeFileTrees(existing, generated)

  assert.equal(merged.src.directory['App.jsx'].file.contents, 'updated app')
  assert.equal(merged.src.directory['keep.txt'].file.contents, 'keep this')
  assert.equal(merged.src.directory.components.directory['Card.jsx'].file.contents, 'export default function Card() {}')
  assert.equal(merged['index.html'].file.contents, '<main>Dashboard</main>')
  assert.deepEqual(collectFilePaths(merged).sort(), [
    'index.html',
    'src/App.jsx',
    'src/components/Card.jsx',
    'src/keep.txt'
  ])
})

test('supports generated file paths that contain directory separators', () => {
  const merged = mergeFileTrees({}, {
    'src/App.jsx': { file: { contents: 'export default function App() {}' } }
  })

  assert.equal(merged.src.directory['App.jsx'].file.contents, 'export default function App() {}')
  assert.deepEqual(collectFilePaths(merged), ['src/App.jsx'])
})

test('rejects generated paths that escape the project root', () => {
  assert.throws(() => mergeFileTrees({}, {
    '../outside.js': { file: { contents: 'unsafe' } }
  }), /traversal segments/i)
})
