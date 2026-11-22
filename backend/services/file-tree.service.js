function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function collectFilePaths(tree, prefix = '') {
    if (!isObject(tree)) return [];

    return Object.entries(tree).flatMap(([name, node]) => {
        const path = prefix ? `${prefix}/${name}` : name;
        if (typeof node?.file?.contents === 'string') return [path];
        if (isObject(node?.directory)) return collectFilePaths(node.directory, path);
        return [];
    });
}

export function mergeFileTrees(existingTree = {}, generatedTree = {}) {
    const merged = {};

    function writeNode(path, node) {
        if (path.startsWith('/') || path.startsWith('\\') || /^[a-z]:[\\/]/i.test(path)) {
            throw new Error('Generated file paths must be relative to the project.');
        }

        const parts = path.split(/[\\/]+/).filter(Boolean);
        if (!parts.length) return;
        if (parts.some(part => part === '.' || part === '..')) {
            throw new Error('Generated file paths cannot contain traversal segments.');
        }

        let cursor = merged;
        for (const part of parts.slice(0, -1)) {
            if (!isObject(cursor[part]?.directory)) cursor[part] = { directory: {} };
            cursor = cursor[part].directory;
        }

        const leaf = parts.at(-1);
        if (typeof node?.file?.contents === 'string') {
            cursor[leaf] = { file: { contents: node.file.contents } };
        } else if (isObject(node?.directory)) {
            if (!isObject(cursor[leaf]?.directory)) cursor[leaf] = { directory: {} };
        }
    }

    function visit(tree, prefix = '') {
        if (!isObject(tree)) return;
        for (const [name, node] of Object.entries(tree)) {
            const path = prefix ? `${prefix}/${name}` : name;
            if (typeof node?.file?.contents === 'string') {
                writeNode(path, node);
            } else if (isObject(node?.directory)) {
                writeNode(path, node);
                visit(node.directory, path);
            }
        }
    }

    visit(existingTree);
    visit(generatedTree);
    return merged;
}
