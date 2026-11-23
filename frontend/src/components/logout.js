export async function logoutSession({ api, storage, setUser, navigate }) {
  try {
    if (storage.getItem('token')) await api.get('/users/logout')
  } catch {
    // Clear the browser session even if the backend cannot be reached.
  } finally {
    storage.removeItem('token')
    setUser(null)
    navigate('/login', { replace: true })
  }
}
