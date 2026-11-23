import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'
import api from '../config/axios'
import { logoutSession } from './logout.js'
import './LogoutButton.css'

export default function LogoutButton({ className = '', compactOnSmall = false }) {
  const { setUser } = useContext(UserContext)
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)

    await logoutSession({ api, storage: localStorage, setUser, navigate })
  }

  return (
    <button
      type="button"
      className={`logout-button ${compactOnSmall ? 'logout-button--compact' : ''} ${className}`.trim()}
      onClick={logout}
      disabled={loggingOut}
      aria-label={loggingOut ? 'Signing out' : 'Sign out'}
      title={loggingOut ? 'Signing out' : 'Sign out'}
    >
      <i className="ri-logout-box-r-line" aria-hidden="true" />
      <span className="logout-button-label">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
    </button>
  )
}
