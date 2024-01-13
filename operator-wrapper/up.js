#!/usr/bin/env node

const { execSync } = require('child_process');
const { argv, env } = require('node:process');
const { readFileSync } = require('node:fs');

const MLYNAR_OUTPUT_DIR = process.env.MLYNAR_OUTPUT_DIR;
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
    throw new Error('No BASE_URL provided');
}

if (!MLYNAR_OUTPUT_DIR) {
    throw new Error('No MLYNAR_OUTPUT_DIR provided');
}

const outputDescription = JSON.parse(readFileSync(`${MLYNAR_OUTPUT_DIR}/mlynar-out.json`, 'utf-8'));

outputDescription.outputs.forEach((output) => {
    execSync(`/usr/bin/curl -X POST ${BASE_URL}/${output.dataKind} -F file=@${output.file}`);
})

console.log('OUTPUT SENT')