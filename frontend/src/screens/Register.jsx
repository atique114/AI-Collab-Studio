import React, { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'
import axios from '../config/axios'

const Register = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const { setUser } = useContext(UserContext)
    const navigate = useNavigate()

    async function submitHandler(e) {
        e.preventDefault()
        setError('')
        try {
            const res = await axios.post('/users/register', { email, password })
            localStorage.setItem('token', res.data.token)
            setUser(res.data.user)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.message || 'We could not create your account. Check your details and try again.')
        }
    }

    return <main className="auth-shell"><section className="auth-story"><a className="brand-lockup" href="/"><span className="brand-mark">✳</span><span>studio<span className="brand-dot">.</span></span></a><div className="auth-story-copy"><div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div><h1>From first<br/>thought to <em>first build.</em></h1><p>Bring your people into one calm, creative space. The best ideas are better shared.</p><div className="story-avatars"><span>A</span><span>I</span><span>＋</span><small>A workspace made for collaboration.</small></div></div><div className="auth-story-footer">AI Collab Studio <span>·</span> Created by Atique Hussain Rangrej, Ashish Patidar &amp; Ashish Nayak</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="eyebrow">GET STARTED</div><h2>Make it a team effort.</h2><p className="auth-subtitle">Create an account and bring your ideas to life.</p><form onSubmit={submitHandler}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required/><label htmlFor="password">Create a password</label><input id="password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 3 characters" minLength={3} required/>{error && <div className="inline-error">{String(error)}</div>}<button className="primary-button auth-submit" type="submit">Create account <span>→</span></button></form><p className="auth-switch">Already have an account? <Link to="/login">Sign in <span>→</span></Link></p></div></section></main>
}

export default Register
