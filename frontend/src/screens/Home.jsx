import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'
import axios from '../config/axios'

const Home = () => {
    const { user } = useContext(UserContext)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [projectName, setProjectName] = useState('')
    const [projects, setProjects] = useState([])
    const [error, setError] = useState('')
    const navigate = useNavigate()

    const loadProjects = () => axios.get('/projects/all').then(res => setProjects(res.data.projects || [])).catch(() => setError('Could not load your projects. Please refresh the page.'))

    useEffect(() => { loadProjects() }, [])

    async function createProject(e) {
        e.preventDefault()
        setError('')
        try {
            await axios.post('/projects/create', { name: projectName.trim() })
            setProjectName('')
            setIsModalOpen(false)
            loadProjects()
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data || 'Could not create the project.')
        }
    }

    return (
        <main className="dashboard-shell">
            <aside className="dashboard-rail">
                <a className="brand-lockup" href="/" aria-label="AI Collab Studio home"><span className="brand-mark">✳</span><span>studio<span className="brand-dot">.</span></span></a>
                <div className="rail-label">WORKSPACE</div>
                <a className="rail-link active" href="/"><span>▦</span> Projects</a>
                <div className="rail-footer"><div className="avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div><div className="rail-user"><strong>{user?.email?.split('@')[0] || 'Your account'}</strong><small>Workspace member</small></div></div>
            </aside>
            <section className="dashboard-content">
                <header className="dashboard-topbar"><span className="crumb">Workspace <span>/</span> Projects</span><div className="topbar-profile"><span className="status-dot"/> All systems ready <div className="avatar small">{user?.email?.[0]?.toUpperCase() || 'U'}</div></div></header>
                <div className="dashboard-main">
                    <div className="welcome-row"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Build something<br/><em>brilliant together.</em></h1><p className="welcome-copy">Your ideas, your team, and a little help from AI — all in one place.</p></div><div className="welcome-orbit"><div className="orbit-core">✳</div><span className="orbit-tag tag-one">AI assist</span><span className="orbit-tag tag-two">Live collab</span><span className="orbit-tag tag-three">Code &amp; preview</span></div></div>
                    <div className="section-heading"><div><h2>Projects <span className="count-pill">{projects.length}</span></h2><p>Pick up where you left off, or start fresh.</p></div><button className="primary-button" onClick={() => { setError(''); setIsModalOpen(true) }}><span>＋</span> New project</button></div>
                    {error && !isModalOpen && <div className="inline-error">{String(error)}</div>}
                    {projects.length ? <div className="project-grid">{projects.map((project, index) => <button key={project._id} className={`project-card card-tone-${index % 3}`} onClick={() => navigate('/project', { state: { project } })}><div className="card-top"><span className="project-icon">{project.name?.[0]?.toUpperCase() || 'P'}</span><span className="card-arrow">↗</span></div><h3>{project.name}</h3><div className="card-meta"><span>◉ &nbsp;{project.users?.length || 0} collaborators</span><span className="live-indicator">● Active</span></div></button>)}</div> : <div className="empty-state"><div className="empty-icon">✳</div><h3>Your next great idea starts here.</h3><p>Create a project to bring your team into a shared AI-powered workspace.</p><button className="secondary-button" onClick={() => setIsModalOpen(true)}>Create your first project <span>→</span></button></div>}
                </div>
                <footer className="dashboard-footer"><span>AI Collab Studio</span><span>Created by Atique Hussain Rangrej, Ashish Patidar &amp; Ashish Nayak</span></footer>
            </section>
            {isModalOpen && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setIsModalOpen(false)}><div className="create-modal"><button className="modal-close" onClick={() => setIsModalOpen(false)}>×</button><div className="modal-symbol">✳</div><div className="eyebrow">NEW WORKSPACE</div><h2>Give your idea a name.</h2><p>Start a shared space for your team to plan, prompt, and build.</p><form onSubmit={createProject}><label htmlFor="project-name">Project name</label><input id="project-name" autoFocus value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Atlas dashboard" required maxLength={80}/>{error && <div className="inline-error">{String(error)}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsModalOpen(false)}>Cancel</button><button type="submit" className="primary-button">Create project <span>→</span></button></div></form></div></div>}
        </main>
    )
}

export default Home
