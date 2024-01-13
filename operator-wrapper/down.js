#!/usr/bin/env node

const { execSync } = require('child_process');
const { argv, env } = require('node:process');

const links = argv.slice(2);
const DATA_FOLDER = process.env.DATA_FOLDER;

if (links.length == 0) {
    throw new Error('No links provided');
}

if (!DATA_FOLDER) {
    throw new Error('No DATA_FOLDER provided');
}

for (const link of links) {
    const id = link.split('/').pop();
    execSync(`/usr/bin/curl -o ${DATA_FOLDER}/${id} ${link}`);
}

console.log('INPUT DOWNLOADED')