/** @typedef {import('@apidevtools/json-schema-ref-parser').JSONSchema} JSONSchema */
/** @typedef {import('openapi-types').OpenAPIV3_1.Document} OpenAPIDocument */
/** @typedef {import('./parse.js').Handlers} Handlers */

import fs from 'node:fs'
import path from 'node:path'

import SwaggerParser from '@apidevtools/json-schema-ref-parser'
import kebabCase from 'lodash/kebabCase.js'

import { envJsonToBru, jsonToBru } from './bru.js'
import parse from './parse.js'
import resolver from './resolver.js'
import { createDirectory, sanitizeDirectoryName, validateSchema } from './utils.js'

/** @typedef {Awaited<ReturnType<typeof parse>>} BrunoCollection */

/**
 *
 * @param {string | OpenAPIDocument} source
 * @param {{
 *  headers?: object
 *  handlers?: Handlers
 *  validate?: boolean
 * }} [options]
 * @returns {Promise<BrunoCollection>}
 */
export async function importCollection(source, options = {}) {
  const { headers = {}, handlers, validate = false } = options

  let fetchError

  const openapi = /** @type {OpenAPIDocument} */(await SwaggerParser.dereference(source, {
    resolve: resolver(headers, (err) => {
      fetchError = err
    }),
  }).catch((err) => {
    if (fetchError) throw fetchError
    throw err
  }))

  const collection = await parse(openapi, handlers)

  if (validate) {
    await validateSchema(collection)
  }

  return collection
}

/**
 *
 * @param {BrunoCollection} collection
 * @param {string} dest
 */
export async function buildDirectory(collection, dest) {
  const collectionName = sanitizeDirectoryName(collection.name)
  const collectionPath = path.resolve(dest)

  // Recursive function to parse the collection items and create files/folders
  function parseCollectionItems(items = [], currentPath) {
    items.forEach((item) => {
      if (['http-request', 'graphql-request'].includes(item.type)) {
        const content = jsonToBru(item)
        const filePath = path.join(currentPath, `${kebabCase(item.filename)}.bru`)
        fs.writeFileSync(filePath, content)
      }

      if (item.type === 'folder') {
        const folderPath = path.join(currentPath, kebabCase(item.name))
        createDirectory(folderPath)

        if (item.items && item.items.length) {
          parseCollectionItems(item.items, folderPath)
        }
      }
    })
  }

  function parseEnvironments(environments = [], collectionPath) {
    const envDirPath = path.join(collectionPath, 'environments')
    if (!fs.existsSync(envDirPath)) {
      fs.mkdirSync(envDirPath)
    }

    environments.forEach((env) => {
      const content = envJsonToBru(env)
      const filePath = path.join(envDirPath, `${kebabCase(env.name)}.bru`)
      fs.writeFileSync(filePath, content)
    })
  }

  createDirectory(collectionPath)

  const brunoConfig = {
    version: '1',
    name: collectionName,
    type: 'collection',
  }
  const content = JSON.stringify(brunoConfig, null, 2)

  fs.writeFileSync(path.join(collectionPath, 'bruno.json'), content)

  // create folder and files based on collection
  parseCollectionItems(collection.items, collectionPath)
  parseEnvironments(collection.environments, collectionPath)
}
