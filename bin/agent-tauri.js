#!/usr/bin/env node
const { createProgram } = require('../src/cli');

const program = createProgram();
program.parse(process.argv);
