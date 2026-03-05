#!/usr/bin/env node

import 'dotenv/config'
import { createCli } from '../src/cli/index.js'

const program = createCli()
program.parse()
