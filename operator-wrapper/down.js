#!/usr/bin/env node

const { execSync } = require('child_process');
const { argv, env } = require('node:process');

const ids = argv.slice(2);
const DATA_FOLDER = process.env.DATA_FOLDER;

if (ids.length == 0) {
  throw new Error('No links provided');
}

if (!DATA_FOLDER) {
  throw new Error('No DATA_FOLDER provided');
}

for (const id of ids) {
  execSync(
    `/usr/bin/curl -o ${DATA_FOLDER}/${id} http://mlynar-service:3000/api/run/data-unit/${id}`,
  );
}

console.log('INPUT DOWNLOADED');
