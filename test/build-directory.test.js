import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import { buildDirectory, importCollection } from '../src/index.js'

test('build directory', async () => {
  const collection = await importCollection('https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore.yaml')
  await buildDirectory(collection, path.resolve(process.cwd(), 'tmp/build-directory'))
  await Promise.all([
    'environments',
    'pets/get-pets-pet-id.bru',
    'pets/get-pets.bru',
    'pets/post-pets.bru',
    'bruno.json',
  ].map(filePath => fs.access(path.resolve(process.cwd(), 'tmp/build-directory', filePath))))
})
