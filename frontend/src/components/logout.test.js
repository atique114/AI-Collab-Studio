import assert from 'node:assert/strict'
import test from 'node:test'
import { logoutSession } from './logout.js'

function makeDependencies(token = 'session-token', request = async () => {}) {
  const events = []
  const storage = {
    getItem(key) {
      events.push(`get:${key}`)
      return key === 'token' ? token : null
    },
    removeItem(key) {
      events.push(`remove:${key}`)
    }
  }

  return {
    events,
    storage,
    api: {
      async get(path) {
        events.push(`request:${path}`)
        return request(path)
      }
    },
    setUser(user) {
      events.push(`user:${user}`)
    },
    navigate(path, options) {
      events.push(`navigate:${path}:${options.replace}`)
    }
  }
}

test('revokes an existing token, clears the session, and redirects to login', async () => {
  const dependencies = makeDependencies()

  await logoutSession(dependencies)

  assert.deepEqual(dependencies.events, [
    'get:token',
    'request:/users/logout',
    'remove:token',
    'user:null',
    'navigate:/login:true'
  ])
})

test('clears the browser session and redirects even when backend logout fails', async () => {
  const dependencies = makeDependencies('session-token', async () => {
    throw new Error('Backend unavailable')
  })

  await assert.doesNotReject(logoutSession(dependencies))

  assert.deepEqual(dependencies.events, [
    'get:token',
    'request:/users/logout',
    'remove:token',
    'user:null',
    'navigate:/login:true'
  ])
})

test('does not call backend logout when no token exists', async () => {
  const dependencies = makeDependencies(null)

  await logoutSession(dependencies)

  assert.deepEqual(dependencies.events, [
    'get:token',
    'remove:token',
    'user:null',
    'navigate:/login:true'
  ])
})
