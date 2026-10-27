// Print the v2 floor and terrain audit over the fixed corpus (js/gen2-measure.js CORPUS).
// usage (repo root): node tools/gen2-measure.mjs [--json] [--routes]
// --routes: print the route metrics instead (js/gen2-routes.js): 1F-only and any-floor walks between far rooms, and the fan test
import { CORPUS, measureWorld, formatReport } from '../js/gen2-measure.js';
import { World2 } from '../js/gen2.js';
import { measureRouteCorpus, formatRoutes } from '../js/gen2-routes.js';

const json = process.argv.includes('--json');
if (process.argv.includes('--routes')) {
  const r = measureRouteCorpus(CORPUS, (seed) => new World2(seed));
  console.log(json ? JSON.stringify(r, null, 2) : formatRoutes(r));
} else {
  const r = measureWorld(CORPUS);
  console.log(json ? JSON.stringify(r, null, 2) : formatReport(r));
}
