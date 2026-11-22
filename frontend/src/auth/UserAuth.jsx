import { useContext, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import api from '../config/axios'
import { UserContext } from '../context/user.context'

export default function UserAuth({ children }) {
  const { user, setUser } = useContext(UserContext)
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('token')))

  useEffect(() => {
    if (!localStorage.getItem('token') || user) return
    let active = true
    api.get('/users/profile').then(({ data }) => {
      if (active) setUser(data.user)
    }).catch(() => {
      localStorage.removeItem('token')
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [setUser, user])

  if (user) return children
  if (checking) return <div className="auth-loading">Loading your workspace...</div>
  return <Navigate to="/login" replace />
}
