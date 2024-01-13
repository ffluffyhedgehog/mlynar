const process = require('node:process');
const fs = require('node:fs');
const path = require('node:path');

const INPUT_SUM = process.env.INPUT_SUM;
const INPUT_LENGTH = process.env.INPUT_LENGTH;
const OUTPUT_DIR = process.env.MLYNAR_OUTPUT_DIR;
const MULTIPLY_BY = process.env.MULTIPLY_BY;

const input_sum = JSON.parse(fs.readFileSync(INPUT_SUM, 'utf8'));
const input_len = JSON.parse(fs.readFileSync(INPUT_LENGTH, 'utf8'));

const output = {
    average: (input_sum.sum / input_len.length) * parseInt(MULTIPLY_BY),
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'average.json'), JSON.stringify(output));

fs.writeFileSync(path.join(OUTPUT_DIR, 'mlynar-out.json'), JSON.stringify({
    outputs: [{
        dataKind: 'number-array-average-json',
        file: path.join(OUTPUT_DIR, 'average.json')
    }]
}));

