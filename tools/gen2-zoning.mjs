// Print the S1 cross-floor topology plan over the fixed corpus (js/gen2-measure.js CORPUS): which district borders get a bridge and what that does
// to the route metrics of js/gen2-routes.js.
// usage (repo root): node tools/gen2-zoning.mjs [--json]
import { CORPUS } from '../js/gen2-measure.js';
import { World2 } from '../js/gen2.js';
import { measureZoningCorpus, formatZoning } from '../js/gen2-zoning.js';

const r = measureZoningCorpus(CORPUS, (seed) => new World2(seed));
console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : formatZoning(r));
