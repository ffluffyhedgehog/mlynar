const process = require('node:process');
const fs = require('node:fs');
const path = require('node:path');

const INPUT_ARRAY = process.env.INPUT_ARRAY;
const OUTPUT_DIR = process.env.MLYNAR_OUTPUT_DIR;
const MULTIPLY_BY = process.env.MULTIPLY_BY;

const input = JSON.parse(fs.readFileSync(INPUT_ARRAY, 'utf8'));

const output = {
    length: input.length * parseInt(MULTIPLY_BY),
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'length.json'), JSON.stringify(output));

fs.writeFileSync(path.join(OUTPUT_DIR, 'mlynar-out.json'), JSON.stringify({
    outputs: [{
        dataKind: 'number-array-length-json',
        file: path.join(OUTPUT_DIR, 'length.json')
    }]
}));

