/** @typedef {import('openapi-types').OpenAPIV3_1.Document} OpenAPIDocument */
/** @typedef {import('openapi-types').OpenAPIV3_1.OperationObject} OperationObject */
/** @typedef {import('openapi-types').OpenAPIV3_1.ParameterObject} ParameterObject */
/** @typedef {import('openapi-types').OpenAPIV3_1.ReferenceObject} ReferenceObject */

/**
 * @typedef {{
 *  beforeCollectionParse: (document: OpenAPIDocument) => OpenAPIDocument
 *  afterCollectionParse: <T, R, E extends T>(collection: T, allRequests: R) => E
 *  afterRequestParse: <T, R, E extends T>(brunoRequest: T, request: R) => E
 * }} Handlers
 */

/**
 * @typedef {{
 *  method: string
 *  path: string
 *  operationObject: OperationObject
 *  global: {
 *    server: string
 *    security: any
 *  }
 * }} Request
 */

import each from 'lodash/each.js'
import get from 'lodash/get.js'
import kebabCase from 'lodash/kebabCase.js'

import { hydrateSeqInCollection, transformItemsInCollection, uuid } from './utils.js'

function buildEmptyJsonBody(bodySchema, compoundName) {
  const _jsonBody = {}
  each(bodySchema.properties || {}, (prop, name) => {
    const fullName = [compoundName, name].filter(Boolean).join('.')
    if (prop.type === 'object') {
      _jsonBody[name] = buildEmptyJsonBody(prop, fullName)
    } else if (prop.type === 'array') {
      _jsonBody[name] = `{{${fullName}}}`
    } else {
      _jsonBody[name] = `{{${fullName}}}`
    }
  })
  return _jsonBody
}

/**
 * @param {any} request
 * @param {Handlers} handlers
 */
function transformOpenapiRequestItem(request, handlers) {
  const _operationObject = request.operationObject

  let operationName = _operationObject.summary || _operationObject.operationId || _operationObject.description
  if (!operationName) {
    operationName = `${request.method} ${request.path}`
  }

  let requestPath = request.path.startsWith('/') ? request.path.slice(1) : request.path
  requestPath = requestPath
    .replace(/\{/g, ':')
    .replace(/\}/g, '')

  const brunoRequestItem = {
    uid: uuid(),
    name: operationName,
    filename: kebabCase(`${request.method} ${request.path}`),
    type: 'http-request',
    request: {
      url: `{{url}}/${requestPath}`,
      method: request.method.toUpperCase(),
      auth: {
        mode: 'none',
        basic: null,
        bearer: null,
        awsv4: null,
      },
      headers: [],
      params: [],
      body: {
        mode: 'none',
        json: null,
        text: null,
        xml: null,
        formUrlEncoded: [],
        multipartForm: [],
      },
    },
  }

  each(_operationObject.parameters || [], (param) => {
    if (param.in === 'query') {
      brunoRequestItem.request.params.push({
        uid: uuid(),
        name: param.name,
        value: `{{${param.name}}}`,
        description: param.description || '',
        type: 'query',
        enabled: param.required,
      })
    } else if (param.in === 'path') {
      brunoRequestItem.request.params.push({
        uid: uuid(),
        name: param.name,
        value: `{{${param.name}}}`,
        description: param.description || '',
        type: 'path',
        enabled: param.required,
      })
    } else if (param.in === 'header') {
      brunoRequestItem.request.headers.push({
        uid: uuid(),
        name: param.name,
        value: `{{${param.name}}}`,
        description: param.description || '',
        enabled: param.required,
      })
    }
  })

  let auth
  // allow operation override
  if (_operationObject.security && _operationObject.security.length > 0) {
    const schemeName = Object.keys(_operationObject.security[0])[0]
    auth = request.global.security.getScheme(schemeName)
  } else if (request.global.security.supported.length > 0) {
    auth = request.global.security.supported[0]
  }

  if (auth) {
    if (auth.type === 'http' && auth.scheme === 'basic') {
      brunoRequestItem.request.auth.mode = 'basic'
      brunoRequestItem.request.auth.basic = {
        username: '{{username}}',
        password: '{{password}}',
      }
    } else if (auth.type === 'http' && auth.scheme === 'bearer') {
      brunoRequestItem.request.auth.mode = 'bearer'
      brunoRequestItem.request.auth.bearer = {
        token: '{{token}}',
      }
    } else if (auth.type === 'apiKey' && auth.in === 'header') {
      brunoRequestItem.request.headers.push({
        uid: uuid(),
        name: auth.name,
        value: '{{apiKey}}',
        description: 'Authentication header',
        enabled: true,
      })
    }
  }

  // TODO: handle allOf/anyOf/oneOf
  if (_operationObject.requestBody) {
    const content = get(_operationObject, 'requestBody.content', {})
    const mimeType = Object.keys(content)[0]
    const body = content[mimeType] || {}
    const bodySchema = body.schema
    if (mimeType === 'application/json') {
      brunoRequestItem.request.body.mode = 'json'
      if (bodySchema && bodySchema.type === 'object') {
        const _jsonBody = buildEmptyJsonBody(bodySchema)
        brunoRequestItem.request.body.json = JSON.stringify(_jsonBody, null, 2)
      }
    } else if (mimeType === 'application/x-www-form-urlencoded') {
      brunoRequestItem.request.body.mode = 'formUrlEncoded'
      if (bodySchema && bodySchema.type === 'object') {
        each(bodySchema.properties || {}, (prop, name) => {
          brunoRequestItem.request.body.formUrlEncoded.push({
            uid: uuid(),
            type: prop.format === 'binary' ? 'file' : 'text',
            name,
            value: prop.format === 'binary' ? [] : '',
            description: prop.description || '',
            enabled: true,
          })
        })
      }
    } else if (mimeType === 'multipart/form-data') {
      brunoRequestItem.request.body.mode = 'multipartForm'
      if (bodySchema && bodySchema.type === 'object') {
        each(bodySchema.properties || {}, (prop, name) => {
          brunoRequestItem.request.body.multipartForm.push({
            uid: uuid(),
            type: prop.format === 'binary' ? 'file' : 'text',
            name,
            value: prop.format === 'binary' ? [] : '',
            description: prop.description || '',
            enabled: true,
          })
        })
      }
    } else if (mimeType === 'text/plain') {
      brunoRequestItem.request.body.mode = 'text'
      brunoRequestItem.request.body.text = ''
    } else if (mimeType === 'text/xml') {
      brunoRequestItem.request.body.mode = 'xml'
      brunoRequestItem.request.body.xml = ''
    }
  }

  return handlers.afterRequestParse(brunoRequestItem, request)
}

function groupRequestsByTags(requests) {
  const _groups = {}
  const ungrouped = []
  each(requests, (request) => {
    const tags = request.operationObject.tags || []
    if (tags.length > 0) {
      const tag = tags[0] // take first tag
      if (!_groups[tag]) {
        _groups[tag] = []
      }

      _groups[tag].push(request)
    } else {
      ungrouped.push(request)
    }
  })

  const groups = Object.keys(_groups).map((groupName) => {
    return {
      name: groupName,
      requests: _groups[groupName],
    }
  })

  return { groups, ungrouped }
}

function getDefaultUrl(serverObject) {
  let url = serverObject.url
  if (serverObject.variables) {
    each(serverObject.variables, (variable, variableName) => {
      const sub = variable.default || (variable.enum ? variable.enum[0] : `{{${variableName}}}`)
      url = url.replace(`{${variableName}}`, sub)
    })
  }
  return url
}

function getSecurity(apiSpec) {
  const defaultSchemes = apiSpec.security || []

  const securitySchemes = get(apiSpec, 'components.securitySchemes', {})
  if (Object.keys(securitySchemes).length === 0) {
    return {
      supported: [],
    }
  }

  return {
    supported: defaultSchemes.map((scheme) => {
      const schemeName = Object.keys(scheme)[0]
      return securitySchemes[schemeName]
    }),
    schemes: securitySchemes,
    getScheme: (schemeName) => {
      return securitySchemes[schemeName]
    },
  }
}

/**
 *
 * @param {OpenAPIDocument} collectionData
 * @param {Handlers} handlers
 */
function parseOpenApiCollection(collectionData, handlers) {
  try {
    collectionData = handlers.beforeCollectionParse(collectionData)

    if (collectionData.openapi && !collectionData.openapi.startsWith('3')) {
      throw new Error('Only OpenAPI v3 is supported currently.')
    }

    const collectionName = collectionData.info.title
    const servers = collectionData.servers || []
    const baseUrl = servers[0] ? getDefaultUrl(servers[0]) : ''
    const securityConfig = getSecurity(collectionData)

    const allRequests = Object.entries(collectionData.paths)
      .map(([path, methods]) => {
        return Object.entries(methods)
          .filter(([method, operationObject]) => {
            return ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(
              method.toLowerCase()
            )
          })
          .map(([method, operationObject]) => {
            if (typeof operationObject !== 'object') {
              return null
            }

            const parameters = []
            if ('parameters' in methods) {
              parameters.push(...methods.parameters)
            }

            if ('parameters' in operationObject) {
              parameters.push(...operationObject.parameters)
            }

            return {
              method,
              path,
              operationObject: {
                parameters: [
                  ...new Map(parameters.filter(item => 'name' in item).map(item => [item.name, item])).values(),
                ],
                ...operationObject,
              },
              global: {
                server: baseUrl,
                security: securityConfig,
              },
            }
          })
          .filter(Boolean)
      })
      .reduce((acc, val) => acc.concat(val), []) // flatten

    /** @type {{ groups: { name: string, requests: typeof allRequests }[], ungrouped: typeof allRequests}} */
    const { groups, ungrouped: ungroupedRequests } = groupRequestsByTags(allRequests)
    const brunoFolders = groups.map((group) => {
      return {
        uid: uuid(),
        name: group.name,
        type: 'folder',
        items: group.requests.map(data => transformOpenapiRequestItem(data, handlers)),
      }
    })

    const ungroupedItems = ungroupedRequests.map(data => transformOpenapiRequestItem(data, handlers))
    return handlers.afterRequestParse({
      name: collectionName,
      uid: uuid(),
      version: '1',
      // @ts-ignore
      items: brunoFolders.concat(ungroupedItems),
      environments: [],
    }, allRequests)
  } catch (err) {
    throw new Error('An error occurred while parsing the OpenAPI collection', err.message)
  }
}

/**
 * @param {...any} data
 * @returns {any}
 */
const noop = data => data

/**
 *
 * @param {OpenAPIDocument} openapi
 * @param {Handlers} [handlers]
 */
export default async function parse(openapi, handlers) {
  return /** @type {ReturnType<typeof parseOpenApiCollection>} */(hydrateSeqInCollection(
    transformItemsInCollection(
      parseOpenApiCollection(openapi, {
        beforeCollectionParse: noop,
        afterCollectionParse: noop,
        afterRequestParse: noop,
        ...(handlers || {}),
      })
    )
  ))
}
