import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Markdown from 'markdown-to-jsx'
import { UserContext } from '../context/user.context'
import api from '../config/axios'
import { initializeSocket } from '../config/socket'
import { getWebContainer } from '../config/webContainer'
import { preparePreviewFiles } from '../utils/preview'
import { createProjectZip, projectArchiveFilename } from '../utils/projectArchive'
import LogoutButton from '../components/LogoutButton'
import '../styles/workspace.css'

function parseAi(raw) {
  try { return JSON.parse(raw) } catch { return { text: raw } }
}

function mergeMessages(...groups) {
  const byId = new Map()
  groups.flat().forEach(item => {
    const key = item._id || `${item.sender?._id}:${item.createdAt}:${item.message}`
    byId.set(key, item)
  })
  return [...byId.values()].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))
}

function getOwnerId(project) {
  const owner = project?.owner
  return String((typeof owner === 'object' ? owner?._id : owner) || project?.users?.[0]?._id || project?.users?.[0] || '')
}

function putAtPath(tree, path, value) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  if (!parts.length) return tree
  const next = structuredClone(tree || {})
  let cursor = next
  parts.slice(0, -1).forEach(part => {
    if (!cursor[part]?.directory) cursor[part] = { directory: {} }
    cursor = cursor[part].directory
  })
  const last = parts.at(-1)
  if (value.directory && cursor[last]?.directory) {
    cursor[last] = { directory: { ...cursor[last].directory, ...value.directory } }
  } else {
    cursor[last] = value
  }
  return next
}

function getAtPath(tree, path) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  let cursor = tree
  for (const part of parts.slice(0, -1)) {
    cursor = cursor?.[part]?.directory
    if (!cursor) return null
  }
  return cursor?.[parts.at(-1)] || null
}

function removeAtPath(tree, path) {
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return tree
  const next = structuredClone(tree || {})
  const parents = []
  let cursor = next
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part]?.directory) return next
    parents.push([cursor, part])
    cursor = cursor[part].directory
  }
  delete cursor[parts.at(-1)]
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const [parent, name] = parents[index]
    if (Object.keys(parent[name].directory).length) break
    delete parent[name]
  }
  return next
}

function normalizeTree(tree = {}) {
  let normalized = {}
  Object.entries(tree).forEach(([path, node]) => {
    if (node?.directory) {
      normalized = putAtPath(normalized, path, { directory: normalizeTree(node.directory) })
    } else if (node?.file) {
      normalized = putAtPath(normalized, path, node)
    }
  })
  return normalized
}

function collectFolders(tree, prefix = '') {
  return Object.entries(tree || {}).flatMap(([name, node]) => {
    if (!node?.directory) return []
    const path = prefix ? prefix + '/' + name : name
    return [path, ...collectFolders(node.directory, path)]
  })
}

function collectEntries(tree, expanded, prefix = '', depth = 0) {
  return Object.entries(tree || {}).flatMap(([name, node]) => {
    const path = prefix ? prefix + '/' + name : name
    if (node?.directory) {
      return [
        { type: 'directory', path, depth },
        ...(expanded.has(path) ? collectEntries(node.directory, expanded, path, depth + 1) : [])
      ]
    }
    return node?.file ? [{ type: 'file', path, depth }] : []
  })
}

export default function Project() {
  const { projectId } = useParams()
  const { user } = useContext(UserContext)
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createKind, setCreateKind] = useState('file')
  const [createPath, setCreatePath] = useState('')
  const [deleteTarget, setDeleteTarget] = useState('')
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [removingUserId, setRemovingUserId] = useState('')
  const [expanded, setExpanded] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [messages, setMessages] = useState([])
  const [pendingAiRequests, setPendingAiRequests] = useState(new Set())
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState({})
  const [file, setFile] = useState('')
  const [draft, setDraft] = useState('')
  const [container, setContainer] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Connecting...')
  const [error, setError] = useState('')
  const socketRef = useRef(null)
  const processRef = useRef(null)
  const bottomRef = useRef(null)
  const messageInputRef = useRef(null)
  const fileTreeRevisionRef = useRef(0)

  useEffect(() => {
    let active = true
    const socket = initializeSocket(projectId)
    socketRef.current = socket
    socket.on('connect', () => { if (active) setStatus('Connected') })
    socket.on('connect_error', err => { if (active) setStatus('Chat unavailable: ' + err.message) })
    socket.on('chat-error', data => {
      if (!active) return
      setError(data?.message || 'Your message could not be saved.')
      if (data?.aiRequestId) {
        setPendingAiRequests(previous => {
          const next = new Set(previous)
          next.delete(data.aiRequestId)
          return next
        })
      }
    })
    socket.on('project-message', data => {
      if (!active) return
      setMessages(previous => mergeMessages(previous, [data]))
      if (data.sender?._id === 'ai') {
        if (data.inReplyTo) {
          setPendingAiRequests(previous => {
            const next = new Set(previous)
            next.delete(data.inReplyTo)
            return next
          })
        }
        const response = parseAi(data.message)
        const tree = response.fileTree
        if (tree && typeof tree === 'object') {
          const normalized = normalizeTree(tree)
          fileTreeRevisionRef.current += 1
          setFiles(normalized)
          setExpanded(new Set(collectFolders(normalized)))
          const firstCreatedFile = response.createdFiles?.[0]
          const firstFile = collectEntries(normalized, new Set(collectFolders(normalized))).find(entry => entry.type === 'file')
          const pathToOpen = firstCreatedFile || firstFile?.path
          if (pathToOpen) setFile(pathToOpen)
          const savedCount = response.createdFiles?.length || (firstFile ? 1 : 0)
          setStatus(savedCount ? `Saved ${savedCount} AI-generated file${savedCount === 1 ? '' : 's'}` : 'Project files updated')
        }
      }
    })
    socket.on('disconnect', () => { if (active) setPendingAiRequests(new Set()) })
    socket.on('project-access-revoked', () => {
      if (!active) return
      setError('Your access to this project was removed.')
      navigate('/', { replace: true })
    })
    socket.on('project-deleted', () => {
      if (!active) return
      setError('This project was deleted by its owner.')
      navigate('/', { replace: true })
    })
    const fileTreeRevisionAtLoad = fileTreeRevisionRef.current
    api.get('/projects/get-project/' + projectId).then(({ data }) => {
      if (active) {
        const normalized = normalizeTree(data.project.fileTree || {})
        setProject(data.project)
        if (fileTreeRevisionRef.current === fileTreeRevisionAtLoad) {
          setFiles(normalized)
          setExpanded(new Set(collectFolders(normalized)))
          const loadedFiles = collectEntries(normalized, new Set(collectFolders(normalized))).filter(entry => entry.type === 'file')
          setFile(current => loadedFiles.some(entry => entry.path === current) ? current : loadedFiles[0]?.path || '')
        }
      }
    }).catch(err => { if (active) setError(err.response?.data?.error || 'Could not load this project.') })
    api.get('/projects/chat-history/' + projectId).then(({ data }) => {
      if (active) setMessages(previous => mergeMessages(data.messages || [], previous))
    }).catch(err => { if (active) setError(err.response?.data?.error || 'Could not load chat history.') })
    api.get('/users/all').then(({ data }) => { if (active) setUsers(data.users || []) }).catch(() => {})
    getWebContainer().then(instance => { if (active) setContainer(instance) }).catch(() => {
      if (active) setStatus('Preview unavailable in this browser')
    })
    return () => { active = false; socket.disconnect(); socketRef.current = null; processRef.current?.kill() }
  }, [projectId, navigate])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pendingAiRequests])
  useEffect(() => { setDraft(getAtPath(files, file)?.file?.contents || '') }, [file, files])

  function send(event) {
    event.preventDefault()
    const text = message.trim()
    if (!text || !socketRef.current?.connected) return
    const aiRequestId = text.includes('@ai')
      ? (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      : undefined
    if (aiRequestId) setPendingAiRequests(previous => new Set(previous).add(aiRequestId))
    socketRef.current.emit('project-message', { message: text, aiRequestId })
    setMessage('')
  }

  function promptStarter() {
    setMessage('@ai Create a responsive React dashboard in src/App.jsx with a sidebar, welcome header, and summary cards.')
    messageInputRef.current?.focus()
  }

  async function save() {
    if (!file) return
    const next = putAtPath(files, file, { file: { contents: draft } })
    setSaving(true)
    try {
      await api.put('/projects/update-file-tree', { projectId, fileTree: next })
      fileTreeRevisionRef.current += 1
      setFiles(next)
      setStatus('Saved ' + file)
    } catch (err) { setError(err.response?.data?.error || 'Could not save the file.') }
    finally { setSaving(false) }
  }

  async function deleteFile() {
    if (!deleteTarget) return
    const deletedPath = deleteTarget
    const next = removeAtPath(files, deletedPath)
    try {
      await api.put('/projects/update-file-tree', { projectId, fileTree: next })
      fileTreeRevisionRef.current += 1
      setFiles(next)
      if (file === deletedPath) setFile('')
      setDeleteTarget('')
      setStatus('Deleted ' + deletedPath)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete the file.')
    }
  }

  async function createEntry(event) {
    event.preventDefault()
    const path = createPath.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    const parts = path.split('/').filter(Boolean)
    if (!parts.length || parts.some(part => part === '.' || part === '..')) {
      setError('Enter a valid file or folder name.')
      return
    }
    const currentEntries = collectEntries(files, new Set(collectFolders(files)))
    if (currentEntries.some(entry => entry.path === path)) {
      setError('That path already exists.')
      return
    }
    const parentIsFile = parts.slice(0, -1).some((_part, index) => {
      const parentPath = parts.slice(0, index + 1).join('/')
      return currentEntries.some(entry => entry.path === parentPath && entry.type === 'file')
    })
    if (parentIsFile) {
      setError('A file already uses part of that path.')
      return
    }
    const next = putAtPath(files, path, createKind === 'folder' ? { directory: {} } : { file: { contents: '' } })
    try {
      await api.put('/projects/update-file-tree', { projectId, fileTree: next })
      fileTreeRevisionRef.current += 1
      setFiles(next)
      setExpanded(new Set([...collectFolders(next), ...parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'))]))
      if (createKind === 'file') setFile(path)
      setCreateOpen(false)
      setCreatePath('')
      setError('')
      setStatus((createKind === 'file' ? 'Created ' : 'Created folder ') + path)
    } catch (err) { setError(err.response?.data?.error || 'Could not create the item.') }
  }

  async function invite() {
    if (!selected.size) return
    try {
      await api.put('/projects/add-user', { projectId, users: [...selected] })
      const { data } = await api.get('/projects/get-project/' + projectId)
      setProject(data.project)
      setSelected(new Set())
      setInviteOpen(false)
      setStatus('Collaborators added')
    } catch (err) { setError(err.response?.data?.error || 'Could not add collaborators.') }
  }

  async function removeCollaborator(member) {
    if (!member?._id || String(member._id) === getOwnerId(project)) return
    if (!window.confirm(`Remove ${member.email} from this project?`)) return
    setRemovingUserId(member._id)
    try {
      const { data } = await api.put('/projects/remove-user', { projectId, userId: member._id })
      setProject(data.project)
      setStatus('Collaborator removed')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove this collaborator.')
    } finally {
      setRemovingUserId('')
    }
  }

  async function removeProject() {
    try {
      await api.delete('/projects/' + projectId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete this project.')
      setDeleteProjectOpen(false)
    }
  }

  function downloadProject() {
    try {
      const exportTree = file ? putAtPath(files, file, { file: { contents: draft } }) : files
      const zip = createProjectZip(exportTree)
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = projectArchiveFilename(project?.name)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('Project ZIP downloaded')
    } catch (err) {
      setError(err.message || 'Could not download this project.')
    }
  }

  async function run() {
    if (!container || !Object.keys(files).length || busy) return
    setBusy(true); setError(''); setStatus('Installing dependencies...')
    try {
      processRef.current?.kill()
      await container.mount(preparePreviewFiles(files))
      const install = await container.spawn('npm', ['install'])
      const installOutput = []
      install.output.pipeTo(new WritableStream({ write: chunk => installOutput.push(chunk) })).catch(() => {})
      const installExitCode = await install.exit
      if (installExitCode !== 0) throw new Error(`Dependency install failed: ${installOutput.join('').trim().slice(-600) || `npm exited with code ${installExitCode}`}`)
      setStatus('Starting preview...')
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Preview timed out')), 30000)
        container.on('server-ready', (_port, url) => { clearTimeout(timer); resolve(url) })
      })
      processRef.current = await container.spawn('npm', ['start'])
      setPreview(await ready)
      setStatus('Preview running')
    } catch (err) { setError('Preview failed: ' + err.message) }
    finally { setBusy(false) }
  }

  if (error && !project) return <main className="workspace-fallback"><h1>Workspace unavailable</h1><p>{error}</p><Link to="/">Back to projects</Link></main>
  const entries = collectEntries(files, expanded)
  const fileCount = collectEntries(files, new Set(collectFolders(files))).filter(entry => entry.type === 'file').length
  const ownerId = getOwnerId(project)
  const isOwner = String(user?._id || '') === ownerId
  return <main className="studio-workspace">
    <aside className="studio-chat">
      <header className="studio-chat-header"><Link className="studio-back" to="/" aria-label="Back to projects">←</Link><div><span className="studio-kicker">PROJECT WORKSPACE</span><h1>{project?.name || 'Loading...'}</h1></div><button onClick={() => setMembersOpen(!membersOpen)} aria-label="Collaborators"><i className="ri-group-line" /></button></header>
      {membersOpen ? <div className="studio-members"><div className="studio-panel-title"><h2>Project team</h2><button onClick={() => setMembersOpen(false)} aria-label="Close">×</button></div><p className="studio-team-caption">People with access to this workspace.</p>{project?.users?.map(member => { const memberIsOwner = String(member._id) === ownerId; return <div key={member._id} className="studio-member"><span className="studio-avatar">{member.email?.[0]?.toUpperCase()}</span><div className="studio-member-info"><strong>{member.email}</strong><small>{memberIsOwner ? 'Project owner' : 'Collaborator'}</small></div>{isOwner && !memberIsOwner && <button className="studio-remove-member" disabled={removingUserId === member._id} onClick={() => removeCollaborator(member)} aria-label={'Remove ' + member.email} title="Remove collaborator">{removingUserId === member._id ? '…' : <i className="ri-user-unfollow-line" />}</button>}</div>})}{isOwner && <><button className="studio-invite" onClick={() => setInviteOpen(true)}>＋ Add collaborator</button><button className="studio-delete-project-link" onClick={() => setDeleteProjectOpen(true)}><i className="ri-delete-bin-line" /> Delete project</button></>}</div> : <><div className="studio-chat-intro"><span>✳</span><strong>Think together, build together.</strong><p>Chat with your team. Mention <code>@ai</code> for coding help.</p></div><div className="studio-messages">{messages.map((item, index) => {
        const ai = item.sender?._id === 'ai'
        const own = item.sender?._id === user?._id
        const response = ai ? parseAi(item.message) : null
        return <div key={item._id || index} className={'studio-message ' + (own ? 'own ' : '') + (ai ? 'ai' : '')}>
          <small>{ai ? 'AI assistant' : own ? 'You' : item.sender?.email || 'Member'}</small>
          {ai ? <>
            <Markdown>{response.text || 'AI response received.'}</Markdown>
            {response.createdFiles?.length > 0 && <div className="studio-ai-artifacts"><span>Saved in project</span>{response.createdFiles.map(path => <button type="button" key={path} onClick={() => setFile(path)}><i className="ri-file-code-line" />{path}</button>)}</div>}
          </> : <p>{item.message}</p>}
        </div>
      })}{pendingAiRequests.size > 0 && <div className="studio-ai-thinking" role="status" aria-live="polite"><i className="ri-loader-4-line" aria-hidden="true" /><span>AI is thinking</span><b><i /><i /><i /></b></div>}<div ref={bottomRef} /></div><form className="studio-composer" onSubmit={send}><label className="sr-only" htmlFor="message">Message</label><input ref={messageInputRef} id="message" value={message} onChange={event => setMessage(event.target.value)} placeholder="Message your team or @ai..." /><button disabled={!message.trim()} aria-label="Send message"><i className="ri-send-plane-fill" /></button></form></>}
    </aside>
    <section className="studio-main"><header className="studio-toolbar"><div className="studio-toolbar-file"><span className="studio-kicker">EDITOR</span><strong>{file || 'Project files'}</strong></div><div className="studio-toolbar-actions"><span className="studio-status" title={status}><i />{status}</span><button className="studio-download" onClick={downloadProject} disabled={!fileCount} title="Download project files as a ZIP"><i className="ri-download-2-line" /><span>Download ZIP</span></button><LogoutButton className="logout-button--workspace studio-logout" compactOnSmall /><button className="studio-run" onClick={run} disabled={!container || !fileCount || busy}><i className="ri-play-fill" /> {busy ? 'Starting...' : 'Run preview'}</button></div></header>{error && <div className="studio-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}<div className="studio-content"><nav className="studio-files" aria-label="Project files"><div className="studio-files-title"><span>FILES <b>{fileCount}</b></span><span className="studio-file-actions"><button title="Create file" aria-label="Create file" onClick={() => { setCreateKind('file'); setCreatePath(''); setCreateOpen(true) }}>＋</button><button title="Create folder" aria-label="Create folder" onClick={() => { setCreateKind('folder'); setCreatePath(''); setCreateOpen(true) }}><i className="ri-folder-add-line" /></button></span></div>{entries.length ? entries.map(entry => entry.type === 'directory' ? <button key={'dir-' + entry.path} className="studio-tree-entry studio-folder" style={{ paddingLeft: 10 + entry.depth * 14 }} onClick={() => setExpanded(previous => { const next = new Set(previous); next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path); return next })}><i className={expanded.has(entry.path) ? 'ri-folder-open-line' : 'ri-folder-line'} />{entry.path.split('/').at(-1)}</button> : <button key={'file-' + entry.path} className={'studio-tree-entry ' + (file === entry.path ? 'active' : '')} style={{ paddingLeft: 10 + entry.depth * 14 }} onClick={() => setFile(entry.path)}><i className="ri-file-code-line" />{entry.path.split('/').at(-1)}</button>) : <div className="studio-files-empty"><p>No saved files yet.</p><button onClick={() => { setCreateKind('file'); setCreatePath(''); setCreateOpen(true) }}>Create a file</button><button className="studio-empty-ai" onClick={promptStarter}>Ask AI to build one</button><small>AI-generated files appear here and are saved to this project.</small></div>}</nav><div className="studio-editor"><div className="studio-editor-tab">{file ? <><span><i className="ri-file-code-line" /> {file}</span><div className="studio-editor-actions"><button className="studio-delete-file" onClick={() => setDeleteTarget(file)} title="Delete file"><i className="ri-delete-bin-line" /> Delete</button><button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div></> : <span>Editor</span>}</div>{file ? <textarea autoFocus aria-label={'Edit ' + file} placeholder={'Start writing in ' + file + '...'} spellCheck="false" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() } }} /> : <div className="studio-editor-empty"><span>⌘</span><h2>Your code workspace</h2><p>Create a file or ask the AI assistant to build a starter project.</p><div className="studio-empty-actions"><button onClick={() => { setCreateKind('file'); setCreatePath(''); setCreateOpen(true) }}>＋ New file</button><button className="studio-empty-ai" onClick={promptStarter}>Ask AI to build a dashboard</button></div></div>}</div>{preview && <div className="studio-preview"><div><span>LIVE PREVIEW</span><a href={preview} target="_blank" rel="noopener" title="If WebContainer asks to connect, choose Connect to Project once.">Open in new tab ↗</a></div><p className="studio-preview-note">First time? Choose <strong>Connect to Project</strong>. Allow pop-ups from WebContainer for automatic reconnects.</p><iframe title="Project preview" src={preview} /></div>}</div></section>
    {deleteTarget && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setDeleteTarget('')}><div className="create-modal studio-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-file-title"><button className="modal-close" onClick={() => setDeleteTarget('')} aria-label="Close">×</button><div className="eyebrow">PROJECT FILES</div><h2 id="delete-file-title">Delete this file?</h2><p><code>{deleteTarget}</code> will be removed from this project. Unsaved edits will be discarded.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget('')}>Cancel</button><button className="studio-confirm-delete" onClick={deleteFile}>Delete file</button></div></div></div>}
    {deleteProjectOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setDeleteProjectOpen(false)}><div className="create-modal studio-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title"><button className="modal-close" onClick={() => setDeleteProjectOpen(false)} aria-label="Close">×</button><div className="eyebrow">PROJECT OWNER</div><h2 id="delete-project-title">Delete {project?.name}?</h2><p>This permanently removes the project, its files, and its saved chat history for everyone.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteProjectOpen(false)}>Cancel</button><button className="studio-confirm-delete" onClick={removeProject}>Delete project</button></div></div></div>}
    {createOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setCreateOpen(false)}><form className="create-modal studio-create-modal" onSubmit={createEntry}><button type="button" className="modal-close" onClick={() => setCreateOpen(false)} aria-label="Close">×</button><div className="eyebrow">PROJECT FILES</div><h2>Create a {createKind}</h2><p>Use a name like <code>{createKind === 'file' ? 'src/App.jsx' : 'src/components'}</code>. Missing folders will be created automatically.</p><label htmlFor="new-item-path">{createKind === 'file' ? 'File path' : 'Folder path'}</label><input id="new-item-path" autoFocus value={createPath} onChange={event => setCreatePath(event.target.value)} placeholder={createKind === 'file' ? 'e.g. src/App.jsx' : 'e.g. src/components'} required/><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="primary-button">Create {createKind}</button></div></form></div>}
    {inviteOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setInviteOpen(false)}><div className="create-modal"><button className="modal-close" onClick={() => setInviteOpen(false)} aria-label="Close">×</button><div className="eyebrow">YOUR TEAM</div><h2>Add collaborators</h2><p>Choose registered people to invite.</p><div className="studio-user-list">{users.filter(candidate => candidate._id !== user?._id && !project?.users?.some(member => member._id === candidate._id)).map(candidate => <label key={candidate._id}><input type="checkbox" checked={selected.has(candidate._id)} onChange={() => setSelected(previous => { const next = new Set(previous); next.has(candidate._id) ? next.delete(candidate._id) : next.add(candidate._id); return next })} />{candidate.email}</label>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button" onClick={invite} disabled={!selected.size}>Add selected</button></div></div></div>}
  </main>
}
