/* eslint-disable regexp/no-unused-capturing-group */
import fs from 'node:fs'

import { collectionSchema } from '@usebruno/schema'
import cloneDeep from 'lodash/cloneDeep.js'
import each from 'lodash/each.js'
import get from 'lodash/get.js'
import { customAlphabet } from 'nanoid'

export function isItemARequest(item) {
  return Object.prototype.hasOwnProperty.call(item, 'request') && ['http-request', 'graphql-request'].includes(item.type) && !item.items
}

// a customized version of nanoid without using _ and -
export function uuid() {
  // https://github.com/ai/nanoid/blob/main/url-alphabet/index.js
  const urlAlphabet = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
  const customNanoId = customAlphabet(urlAlphabet, 21)

  return customNanoId()
}

export function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash &= hash // Convert to 32bit integer
  }
  return new Uint32Array([hash])[0].toString(36)
}

export function waitForNextTick() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), 0)
  })
}

export function safeParseJSON(str) {
  if (!str || !str.length || typeof str !== 'string') {
    return str
  }

  try {
    return JSON.parse(str)
  } catch (e) {
    return str
  }
}

export function safeStringifyJSON(obj, indent = false) {
  if (obj === undefined) {
    return obj
  }

  try {
    if (indent) {
      return JSON.stringify(obj, null, 2)
    }

    return JSON.stringify(obj)
  } catch (e) {
    return obj
  }
}

// Remove any characters that are not alphanumeric, spaces, hyphens, or underscores
export function normalizeFileName(name) {
  if (!name) {
    return name
  }

  const validChars = /[^\\.\w\s-]/g
  const formattedName = name.replace(validChars, '-')

  return formattedName
}

export function getContentType(headers) {
  if (headers && headers.length) {
    const contentType = headers
      .filter(header => header[0].toLowerCase() === 'content-type')
      .map((header) => {
        return header[1]
      })
    if (contentType && contentType.length) {
      if (typeof contentType[0] === 'string' && /^[\w-]+\/([\w-]+\+)?json/.test(contentType[0])) {
        return 'application/ld+json'
      } else if (typeof contentType[0] === 'string' && /^[\w-]+\/([\w-]+\+)?xml/.test(contentType[0])) {
        return 'application/xml'
      }

      return contentType[0]
    }
  }

  return ''
}

export function startsWith(str, search) {
  if (!str || !str.length || typeof str !== 'string') {
    return false
  }

  if (!search || !search.length || typeof search !== 'string') {
    return false
  }

  return str.substr(0, search.length) === search
}

export function pluralizeWord(word, count) {
  return count === 1 ? word : `${word}s`
}

export async function validateSchema(collection = {}) {
  await collectionSchema.validate(collection)
}

export function updateUidsInCollection(_collection) {
  const collection = cloneDeep(_collection)

  collection.uid = uuid()

  const updateItemUids = (items = []) => {
    each(items, (item) => {
      item.uid = uuid()

      each(get(item, 'request.headers'), header => (header.uid = uuid()))
      each(get(item, 'request.query'), param => (param.uid = uuid()))
      each(get(item, 'request.params'), param => (param.uid = uuid()))
      each(get(item, 'request.vars.req'), v => (v.uid = uuid()))
      each(get(item, 'request.vars.res'), v => (v.uid = uuid()))
      each(get(item, 'request.assertions'), a => (a.uid = uuid()))
      each(get(item, 'request.body.multipartForm'), param => (param.uid = uuid()))
      each(get(item, 'request.body.formUrlEncoded'), param => (param.uid = uuid()))

      if (item.items && item.items.length) {
        updateItemUids(item.items)
      }
    })
  }
  updateItemUids(collection.items)

  const updateEnvUids = (envs = []) => {
    each(envs, (env) => {
      env.uid = uuid()
      each(env.variables, variable => (variable.uid = uuid()))
    })
  }
  updateEnvUids(collection.environments)

  return collection
}

export function transformItemsInCollection(collection) {
  const transformItems = (items = []) => {
    each(items, (item) => {
      item.name = normalizeFileName(item.name)

      if (['http', 'graphql'].includes(item.type)) {
        item.type = `${item.type}-request`
        if (item.request.query) {
          item.request.params = item.request.query
        }

        delete item.request.query
      }

      if (item.items && item.items.length) {
        transformItems(item.items)
      }
    })
  }

  transformItems(collection.items)

  return collection
}

export function hydrateSeqInCollection(collection) {
  const hydrateSeq = (items = []) => {
    let index = 1
    each(items, (item) => {
      if (isItemARequest(item) && !item.seq) {
        item.seq = index
        index++
      }
      if (item.items && item.items.length) {
        hydrateSeq(item.items)
      }
    })
  }
  hydrateSeq(collection.items)

  return collection
}

export function sanitizeDirectoryName(name) {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
}

export function createDirectory(dir) {
  if (!dir) {
    throw new Error('directory: path is null')
  }

  if (fs.existsSync(dir)) {
    return
  }

  return fs.mkdirSync(dir, {
    recursive: true,
  })
}

export function generateUidBasedOnHash(str) {
  const hash = simpleHash(str)

  return `${hash}`.padEnd(21, '0')
}
