import test from 'node:test'
import assert from 'node:assert/strict'
import { generateResult, getAiFailureMessage, isFileChangeRequest } from '../services/ai.service.js'

test('reports an OpenAI project with insufficient quota', () => {
  const message = getAiFailureMessage({
    status: 429,
    code: 'insufficient_quota'
  })

  assert.match(message, /no available quota/i)
  assert.match(message, /billing status/i)
})

test('reports an OpenAI rate limit separately from billing', () => {
  assert.match(getAiFailureMessage({ status: 429, code: 'rate_limit_exceeded' }), /rate limit was reached/i)
})

test('reports when the API key is rejected', () => {
  assert.match(getAiFailureMessage({ status: 401, code: 'invalid_api_key' }), /rejected the configured API key/i)
})

test('reports when the project cannot access its configured model', () => {
  assert.match(getAiFailureMessage({ status: 404, code: 'model_not_found' }), /cannot access the configured model/i)
})

test('reports malformed OpenAI requests separately', () => {
  assert.match(getAiFailureMessage({ status: 400 }), /rejected the request format/i)
})

test('explains when the model did not return files for a creation request', () => {
  assert.match(getAiFailureMessage({ code: 'AI_RESPONSE_MISSING_FILES' }), /nothing was saved/i)
})

test('detects direct file creation requests', () => {
  assert.equal(isFileChangeRequest('create a app.jsx file and write a dashboard in it'), true)
  assert.equal(isFileChangeRequest('write a dashboard in design.html'), true)
})

test('does not treat a question about an existing file location as a creation request', () => {
  assert.equal(isFileChangeRequest('where did you create and save this file?'), false)
})

test('explains when the backend cannot connect to OpenAI', () => {
  assert.match(getAiFailureMessage(new Error('Connection error.')), /could not connect to OpenAI/i)
})

test('reports a generation timeout as a slow OpenAI response', () => {
  const error = new Error('Request timed out.')
  error.cause = new Error('This operation was aborted')

  assert.match(getAiFailureMessage(error), /took too long to respond/i)
})

test('includes the underlying network cause when diagnosing a connection failure', () => {
  const error = new Error('Request failed')
  error.cause = new Error('ENOTFOUND api.openai.com')

  assert.match(getAiFailureMessage(error), /DNS/i)
})

test('missing API key is reported without trying to call OpenAI', async () => {
  const originalKey = process.env.GPT_AI_KEY
  delete process.env.GPT_AI_KEY

  try {
    await assert.rejects(generateResult('hello'), error => {
      assert.equal(error.code, 'AI_KEY_MISSING')
      assert.match(getAiFailureMessage(error), /Add GPT_AI_KEY/i)
      return true
    })
  } finally {
    if (originalKey === undefined) delete process.env.GPT_AI_KEY
    else process.env.GPT_AI_KEY = originalKey
  }
})

test('incomplete Responses API output gets an actionable message', () => {
  const error = new Error('OpenAI returned an incomplete response.')
  error.code = 'AI_RESPONSE_INCOMPLETE'

  assert.match(getAiFailureMessage(error), /response was incomplete/i)
})
