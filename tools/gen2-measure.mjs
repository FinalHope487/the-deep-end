// Print the v2 floor and terrain audit over the fixed corpus (js/gen2-measure.js CORPUS).
// usage (repo root): node tools/gen2-measure.mjs [--json]
import { CORPUS, measureWorld, formatReport } from '../js/gen2-measure.js';

const r = measureWorld(CORPUS);
console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : formatReport(r));
