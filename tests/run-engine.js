// Runs the engine checks in Node:  node tests/run-engine.js
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const T = require(path.join(__dirname, 'engine-tests.js'));
const r = T.run(E);
for (const f of r.failures) console.log('FAIL  ' + f);
console.log(`${r.passed} passed, ${r.failed} failed`);
process.exit(r.failed ? 1 : 0);
