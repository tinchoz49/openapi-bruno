#!/usr/bin/env node
import * as p from '@clack/prompts'
import meow from 'meow'

import { buildDirectory, importCollection } from '../src/index.js'

const cli = meow(`
  Usage
    $ openapi-bruno <input>

  Options
    --output, -o Output directory, default to ".bruno"
    --header, -h Send headers to the request in case <input> is remote

  Examples
    $ openapi-bruno ./openapi.json
    $ openapi-bruno https://api.com/doc.json
    $ openapi-bruno https://api.com/doc.json -h 'Authorization=Bearer secrettoken'
`, {
  importMeta: import.meta,
  allowUnknownFlags: false,
  autoHelp: true,
  flags: {
    output: {
      type: 'string',
      shortFlag: 'o',
      default: '.bruno',
    },
    header: {
      type: 'string',
      shortFlag: 'h',
      isMultiple: true,
    },
    validate: {
      type: 'boolean',
      shortFlag: 'v',
      default: true,
    },
  },
})

if (cli.input.length === 0) {
  cli.showHelp()
}

const input = cli.input[0]

const headers = {}
cli.flags.header.forEach((header) => {
  const splitIdx = header.indexOf('=')
  if (splitIdx === -1) {
    console.error('Fetch: the header provided is not valid, it must be: key=value')
    process.exit(1)
  }
  const key = header.slice(0, splitIdx)
  const value = header.slice(splitIdx + 1)
  headers[key] = value
})

p.intro('openapi-bruno')

const spinner = p.spinner()

try {
  spinner.start(`Importing collection from ${input}`)

  const collection = await importCollection(input, {
    headers,
    validate: cli.flags.validate,
  })

  spinner.message('Building directory')

  await buildDirectory(collection, cli.flags.output)
} catch (err) {
  console.error(err)
  process.exit(1)
}

spinner.stop('Bruno directory is done!')
