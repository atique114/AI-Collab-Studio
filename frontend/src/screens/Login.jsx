import React, { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from '../config/axios'
import { UserContext } from '../context/user.context'

function getAuthError(error, fallback) {
    const validationErrors = error.response?.data?.errors
    if (Array.isArray(validationErrors)) {
        return validationErrors.map(item => item.msg).filter(Boolean).join(' ')
    }
    if (typeof validationErrors === 'string') return validationErrors
    if (typeof error.response?.data === 'string' && !error.response.data.trimStart().startsWith('<')) {
        return error.response.data
    }
    return error.response?.data?.message || error.message || fallback
}

const Login = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const { setUser } = useContext(UserContext)
    const navigate = useNavigate()

    async function submitHandler(e) {
        e.preventDefault()
        setError('')
        try {
            const res = await axios.post('/users/login', { email, password })
            localStorage.setItem('token', res.data.token)
            setUser(res.data.user)
            navigate('/')
        } catch (err) {
            setError(getAuthError(err, 'We could not sign you in. Check your details and try again.'))
        }
    }

    return <main className="auth-shell"><section className="auth-story"><a className="brand-lockup" href="/"><span className="brand-mark">✳</span><span>studio<span className="brand-dot">.</span></span></a><div className="auth-story-copy"><div className="eyebrow">MAKE ROOM FOR BIG IDEAS</div><h1>Good work<br/>happens <em>together.</em></h1><p>A shared space to think with AI, build with your team, and turn a spark into something real.</p><div className="story-avatars"><span>A</span><span>I</span><span>＋</span><small>Made for teams that make things.</small></div></div><div className="auth-story-footer">AI Collab Studio <span>·</span> Created by Atique Hussain Rangrej, Ashish Patidar &amp; Ashish Nayak</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your studio.</h2><p className="auth-subtitle">Your team is right where you left it.</p><form onSubmit={submitHandler}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required/>{error && <div className="inline-error">{String(error)}</div>}<button className="primary-button auth-submit" type="submit">Sign in <span>→</span></button></form><p className="auth-switch">New to the studio? <Link to="/register">Create an account <span>→</span></Link></p></div></section></main>
}

export default Login
