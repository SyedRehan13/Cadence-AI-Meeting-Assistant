import test from 'node:test'
import assert from 'node:assert/strict'
import { api } from '../src/api.js'

function setup(t, fetch) {
  const events = []
  t.mock.method(globalThis, 'fetch', fetch)
  const previousWindow = globalThis.window
  globalThis.window = { dispatchEvent: (event) => events.push(event) }
  t.after(() => { globalThis.window = previousWindow })
  return events
}

test('expired authenticated requests notify the session that failed', async (t) => {
  const events = setup(t, async () => Response.json({ detail: 'Session ended' }, { status: 401 }))
  await assert.rejects(api.me('old-session'), { message: 'Session ended' })
  assert.equal(events.length, 1)
  assert.equal(events[0].detail, 'old-session')
  // A failed password login is not a request to end an existing session.
  await assert.rejects(api.login({ email: 'member@example.com', password: 'wrong' }))
  assert.equal(events.length, 1)
})

test('background expiry cannot interrupt a pending password/session update', async (t) => {
  let completeUpdate
  const events = setup(t, async (url) => {
    if (url.endsWith('/auth/password')) return new Promise((resolve) => { completeUpdate = resolve })
    return Response.json({ detail: 'Old session ended' }, { status: 401 })
  })
  const update = api.changePassword('old-session', { current_password: 'old', new_password: 'new-password' })
  assert.equal(api.isUpdatingSession('old-session'), true)
  await assert.rejects(api.me('old-session'))
  assert.equal(events.length, 0)
  completeUpdate(Response.json({ access_token: 'new-session' }))
  assert.equal((await update).access_token, 'new-session')
  assert.equal(api.isUpdatingSession('old-session'), false)
})

test('an expired session cannot perform a security update and is cleared', async (t) => {
  const events = setup(t, async () => Response.json({ detail: 'Session ended' }, { status: 401 }))
  await assert.rejects(api.unlinkGoogle('expired-session', { current_password: 'password' }))
  assert.equal(events.length, 1)
  assert.equal(events[0].detail, 'expired-session')
  assert.equal(api.isUpdatingSession('expired-session'), false)
})
