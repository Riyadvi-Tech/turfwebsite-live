import test from 'node:test'
import assert from 'node:assert/strict'

import { publicSettings } from './settings.js'
import { safeSettings } from './admin/settings.js'

test('public settings expose bookingsBlocked flag with a safe default', () => {
  const settings = publicSettings({})
  assert.equal(settings.bookingsBlocked, false)
})

test('admin safe settings preserve the bookingsBlocked flag', () => {
  const settings = safeSettings({ bookingsBlocked: true })
  assert.equal(settings.bookingsBlocked, true)
})
