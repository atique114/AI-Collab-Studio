const DEFAULT_PACKAGE = {
  name: 'ai-collab-preview',
  private: true,
  version: '1.0.0',
  type: 'module',
  scripts: { start: 'vite --host 0.0.0.0' },
  dependencies: { vite: '^6.0.1' },
}

function filePaths(tree, prefix = '') {
  return Object.entries(tree || {}).flatMap(([name, node]) => {
    const path = prefix ? `${prefix}/${name}` : name
    if (node?.directory) return filePaths(node.directory, path)
    return node?.file ? [path] : []
  })
}

function getContents(tree, path) {
  let cursor = tree
  const parts = path.split('/').filter(Boolean)
  for (const part of parts.slice(0, -1)) {
    cursor = cursor?.[part]?.directory
    if (!cursor) return undefined
  }
  return cursor?.[parts.at(-1)]?.file?.contents
}

function putFile(tree, path, contents) {
  const parts = path.split('/').filter(Boolean)
  let cursor = tree
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part]?.directory) cursor[part] = { directory: {} }
    cursor = cursor[part].directory
  }
  cursor[parts.at(-1)] = { file: { contents } }
}

function jsxEntry(paths) {
  return ['src/App.jsx', 'src/app.jsx', 'App.jsx', 'app.jsx'].find(path => paths.includes(path))
}

export function preparePreviewFiles(projectTree) {
  const tree = structuredClone(projectTree || {})
  const paths = filePaths(tree)
  const appPath = jsxEntry(paths)
  const packageContents = getContents(tree, 'package.json')

  let packageJson
  if (packageContents) {
    try {
      packageJson = JSON.parse(packageContents)
    } catch {
      throw new Error('package.json is not valid JSON.')
    }
  } else {
    packageJson = structuredClone(DEFAULT_PACKAGE)
  }

  packageJson.scripts ||= {}
  if (!packageJson.scripts.start) {
    packageJson.scripts.start = packageJson.scripts.dev
      ? 'npm run dev -- --host 0.0.0.0'
      : 'vite --host 0.0.0.0'
  }
  packageJson.dependencies ||= {}
  packageJson.devDependencies ||= {}
  const hasDependency = name => packageJson.dependencies[name] || packageJson.devDependencies[name]
  if (!packageJson.scripts.dev && !hasDependency('vite')) packageJson.devDependencies.vite = '^6.0.1'
  if (appPath) {
    if (!hasDependency('react')) packageJson.dependencies.react = '^18.3.1'
    if (!hasDependency('react-dom')) packageJson.dependencies['react-dom'] = '^18.3.1'
  }
  putFile(tree, 'package.json', JSON.stringify(packageJson, null, 2))

  if (!paths.includes('index.html')) {
    const designPath = paths.find(path => /^design\.html$/i.test(path)) || paths.find(path => /\.html$/i.test(path))
    const html = appPath
      ? '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Project preview</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>'
      : designPath
        ? getContents(tree, designPath)
        : '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Project preview</title></head><body><main><h1>Your preview is ready</h1><p>Add an index.html file to start building.</p></main></body></html>'
    putFile(tree, 'index.html', html)
  }

  if (appPath && !paths.some(path => /^src\/main\.[jt]sx?$/.test(path))) {
    const importPath = appPath.startsWith('src/') ? `./${appPath.slice(4)}` : `../${appPath}`
    putFile(tree, 'src/main.jsx', `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from '${importPath}';\n\ncreateRoot(document.getElementById('root')).render(React.createElement(App));\n`)
  }

  return tree
}
