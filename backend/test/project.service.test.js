import test from 'node:test'
import assert from 'node:assert/strict'
import projectModel from '../models/project.model.js'
import { getProjectById, updateFileTree } from '../services/project.service.js'

const projectId = '507f1f77bcf86cd799439011'
const memberId = '507f191e810c19729de860ea'

test('project read includes membership in the database query', async () => {
  const original = projectModel.findOne
  let filter
  projectModel.findOne = query => {
    filter = query
    return { populate: async () => ({ _id: projectId, users: [memberId] }) }
  }
  try {
    const project = await getProjectById({ projectId, userId: memberId })
    assert.equal(project._id, projectId)
    assert.deepEqual(filter, { _id: projectId, users: memberId })
  } finally { projectModel.findOne = original }
})

test('file update includes membership in the database query', async () => {
  const original = projectModel.findOneAndUpdate
  let filter
  let update
  projectModel.findOneAndUpdate = async (query, value) => {
    filter = query
    update = value
    return { _id: projectId }
  }
  try {
    await updateFileTree({ projectId, userId: memberId, fileTree: { 'app.js': { file: { contents: 'ok' } } } })
    assert.deepEqual(filter, { _id: projectId, users: memberId })
    assert.equal(update.fileTree['app.js'].file.contents, 'ok')
  } finally { projectModel.findOneAndUpdate = original }
})

test('invalid project IDs are rejected before database access', async () => {
  await assert.rejects(getProjectById({ projectId: 'invalid', userId: memberId }), /Invalid projectId/)
})
