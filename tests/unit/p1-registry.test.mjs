// Check IDs: P1-A05 (landmark replacement), P1-A06 (fifth region), P1-A07 (no fixed region count).
// Required slice 3b API:
//   js/v3/modules/registry.js: createRegistry({regions,landmarks}) -> frozen registry,
//     or Result<frozen registry>; duplicate moduleId => DUP_MODULE,
//     duplicate slotId => DUP_SLOT, invalid descriptors or generate => failure.
// Proposed names for four static composition exports (P1-A07):
//   modules/registry-config.js: createDefaultRegistry() -> Registry or Result<Registry>.
//   modules/adapters.js: createDefaultAdapters() -> {shapeAdapters,featureAdapters}.
//   modules/world-config.js: DEFAULT_STRUCTURAL_CONFIG -> {cellSize,maxSpaceExtent}.
//   modules/journey-config.js: DEFAULT_JOURNEY_CONFIG -> ordered journey settings.
//   js/v3/core/world.js: composeWorld(config,registry,adapters) -> Result<{descriptor,context}>;
//     queryWorld(context,bounds) -> Result<Snapshot>.
//   js/v3/core/journey.js: resolveJourneyAnchors(context) -> Result<{anchorsVersion,anchors}>.
// Module implementation: {descriptor:{formatVersion,moduleId,moduleVersion,kind,
//   slotId,featureSpecs},generate({worldId,seed,slotId,cell,config})}; synchronous pure.
// PROPOSED landmark rule: it uses the existing cell-owned Space contract and
//   landmark ownerKind / l-kind ownerId. Landmarks do not add journey segments;
//   anchor kind 'landmark' appears in landmarkSlotIds order.
// Test source trees are assembled under OS temp, never inside shipped modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRegistry } from '../../js/v3/modules/registry.js';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { resolveJourneyAnchors } from '../../js/v3/core/journey.js';
import { DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS } from '../../js/v3/core/space.js';
import { parseWorldObjectId, makeWorldObjectId, encodeCoordinate } from '../../js/v3/core/ids.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const BUILDER = join(REPO, 'tools/build.mjs');
const SLOTS = ['region01', 'region02', 'region03', 'region04'];
const v = (x,y,z) => ({ x,y,z });
const query = { min:v(0,-2,0), max:v(32,8,16) };
const adapters = { shapeAdapters:DEFAULT_SHAPE_ADAPTERS,
  featureAdapters:DEFAULT_FEATURE_ADAPTERS };
function ok(r) { assert.equal(r?.ok,true,JSON.stringify(r)); return r.value; }
function registryValue(value) { return value?.ok === true ? value.value : value; }
function failedRegistry(factory, code) {
  let outcome;
  try { outcome = factory(); }
  catch (error) {
    assert.equal(error.code, code, String(error));
    return;
  }
  assert.equal(outcome?.ok, false, 'invalid registry was accepted');
  assert.equal(outcome.code, code);
}
function moduleOf(kind, slotId, version = 1) {
  const descriptor = { formatVersion:1, moduleId:`test.${slotId}`,
    moduleVersion:version, kind, slotId, featureSpecs:[] };
  return { descriptor, generate(ctx) {
    const { configFingerprint:fp } = parseWorldObjectId(ctx.worldId).value;
    const size = ctx.config.structuralConfig.cellSize;
    const x = ctx.cell.ix * size + (kind === 'landmark' ? 20 : 4);
    const z = ctx.cell.iz * size + 3;
    const key = `${slotId}.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;
    const spaceId = makeWorldObjectId('s',ctx.seed,fp,key);
    const space = { formatVersion:1, spaceId, worldId:ctx.worldId,
      ownerKind:kind, ownerId:makeWorldObjectId(kind === 'region' ? 'r' : 'l',ctx.seed,fp,slotId),
      frame:{origin:v(x,0,z)}, bounds:{min:v(x,0,z),max:v(x+8,5,z+8)},
      levels:[{levelId:'ground',datumY:0}], volumes:[{volumeId:'air',kind:'open',
        levelId:'ground',shape:{kind:'box',v:1,p:{min:v(0,0,0),max:v(8,5,8)}}}],
      portals:[],features:[],access:'traversable' };
    const traversal = {formatVersion:1,spaceId,nodes:[],surfaces:[],links:[],blockedVolumeIds:[]};
    return {spaces:[space],traversals:[traversal]};
  } };
}
function scenario(regions = SLOTS, landmarks = ['landmark01'], version = 1) {
  const regionModules = regions.map((slot) => moduleOf('region',slot));
  const landmarkModules = landmarks.map((slot) => moduleOf('landmark',slot,version));
  const registry = registryValue(createRegistry({regions:regionModules,landmarks:landmarkModules}));
  assert.ok(registry && Array.isArray(registry.regions) && Array.isArray(registry.landmarks));
  const config = {seed:42,generatorFormat:1,
    structuralConfig:{cellSize:64,maxSpaceExtent:16},
    journeyConfig:{regionSlotIds:[...regions],landmarkSlotIds:[...landmarks],
      exitSlotId:'exit01',segments:Array(regions.length+1).fill(15),objectiveIds:[]},
    modules:[...regionModules,...landmarkModules].map(({descriptor:d}) =>
      ({kind:d.kind,slotId:d.slotId,moduleId:d.moduleId,moduleVersion:d.moduleVersion})),
    adapters:[]};
  return {registry,config};
}
function compose(data) { return ok(composeWorld(data.config,data.registry,adapters)); }
function visit(context) { return ok(queryWorld(context,query)); }
function localKeys(snapshot,ownerKind) {
  return snapshot.spaces.filter((s)=>s.ownerKind===ownerKind)
    .map((s)=>parseWorldObjectId(s.spaceId).value.localKey).sort();
}

test('[P1-A07] production composition has four explicit config boundaries', async () => {
  const root = join(REPO,'js/v3/modules');
  for (const name of ['registry-config.js','adapters.js','world-config.js','journey-config.js']) {
    assert.ok(existsSync(join(root,name)), `missing static composition file: ${name}`);
  }
  const registryModule=await import(pathToFileURL(join(root,'registry-config.js')).href);
  const adapterModule=await import(pathToFileURL(join(root,'adapters.js')).href);
  const worldModule=await import(pathToFileURL(join(root,'world-config.js')).href);
  const journeyModule=await import(pathToFileURL(join(root,'journey-config.js')).href);
  assert.equal(typeof registryModule.createDefaultRegistry,'function');
  assert.equal(typeof adapterModule.createDefaultAdapters,'function');
  const defaults=worldModule.DEFAULT_STRUCTURAL_CONFIG;
  assert.ok(defaults?.cellSize>0 && defaults?.maxSpaceExtent>=0);
  const journey=journeyModule.DEFAULT_JOURNEY_CONFIG;
  assert.ok(Array.isArray(journey?.regionSlotIds) && journey.regionSlotIds.length===4);
  assert.ok(Array.isArray(journey?.landmarkSlotIds));
  assert.equal(journey.segments.length,journey.regionSlotIds.length+1);
  const registry=registryValue(registryModule.createDefaultRegistry());
  assert.equal(registry.regions.length,journey.regionSlotIds.length);
  assert.equal(registry.landmarks.length,journey.landmarkSlotIds.length);
  const actualAdapters=adapterModule.createDefaultAdapters();
  assert.ok(actualAdapters?.shapeAdapters && actualAdapters?.featureAdapters);
});

test('[P1-A05] createRegistry accepts valid modules and freezes its registry', () => {
  const data = scenario();
  assert.ok(Object.isFrozen(data.registry));
  assert.ok(Object.isFrozen(data.registry.regions));
  assert.ok(Object.isFrozen(data.registry.landmarks));
  assert.equal(data.registry.regions.length,4);
  assert.equal(data.registry.landmarks.length,1);
});

test('[P1-A05] duplicate module IDs and slots are independent errors', () => {
  const a = moduleOf('region','region01');
  const duplicateModuleId = moduleOf('region','region02');
  duplicateModuleId.descriptor.moduleId = a.descriptor.moduleId;
  failedRegistry(()=>createRegistry({regions:[a,duplicateModuleId],landmarks:[]}), 'DUP_MODULE');
  const duplicateSlotId = moduleOf('region','region01');
  duplicateSlotId.descriptor.moduleId = 'other.module';
  failedRegistry(()=>createRegistry({regions:[a,duplicateSlotId],landmarks:[]}), 'DUP_SLOT');
  const acrossKinds = moduleOf('landmark','region01');
  failedRegistry(()=>createRegistry({regions:[a],landmarks:[acrossKinds]}), 'DUP_SLOT');
});

test('[P1-A05] registry rejects wrong kind, schema version and missing generator', () => {
  const wrongKind = moduleOf('landmark','landmark01');
  failedRegistry(()=>createRegistry({regions:[wrongKind],landmarks:[]}), 'BAD_FIELD');
  const wrongVersion = moduleOf('region','region01');
  wrongVersion.descriptor.formatVersion = 2;
  failedRegistry(()=>createRegistry({regions:[wrongVersion],landmarks:[]}), 'BAD_VERSION');
  const noGenerator = moduleOf('region','region01');
  delete noGenerator.generate;
  failedRegistry(()=>createRegistry({regions:[noGenerator],landmarks:[]}), 'BAD_TYPE');
});

test('[P1-A05] landmark modules generate canonical landmark Spaces and stable slot keys', () => {
  const base = compose(scenario());
  const snap = visit(base.context);
  assert.ok(snap.spaces.some((s)=>s.ownerKind==='landmark'
    && parseWorldObjectId(s.ownerId).value.kind==='l'));
  const changed = compose(scenario(SLOTS,['landmark01'],2));
  assert.notEqual(base.descriptor.worldId,changed.descriptor.worldId);
  const changedSnap = visit(changed.context);
  assert.deepEqual(localKeys(snap,'region'),localKeys(changedSnap,'region'),
    'replacing a landmark must preserve other slots local Space keys');
  assert.deepEqual(localKeys(snap,'landmark'),localKeys(changedSnap,'landmark'));
});

test('[P1-A07] landmarks do not require an extra region segment (PROPOSED)', () => {
  const {context} = compose(scenario());
  const anchors = ok(resolveJourneyAnchors(context)).anchors;
  assert.deepEqual(anchors.filter((a)=>a.kind==='region').map((a)=>a.slotId),SLOTS);
  assert.deepEqual(anchors.filter((a)=>a.kind==='landmark').map((a)=>a.slotId),['landmark01']);
  assert.equal(anchors.filter((a)=>a.kind==='start').length,1);
  assert.equal(anchors.filter((a)=>a.kind==='exit').length,1);
});

async function tempTree(action) {
  const dir = mkdtempSync(join(tmpdir(),'p1-registry-'));
  try { return await action(dir); }
  finally { rmSync(dir,{recursive:true,force:true}); }
}
function put(root,path,content) {
  const file = join(root,...path.split('/'));
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,content);
}
function treeFiles(root) {
  const names = [];
  function walk(dir) {
    for (const ent of readdirSync(dir,{withFileTypes:true})) {
      const path = join(dir,ent.name);
      if (ent.isDirectory()) walk(path);
      else if (ent.isFile()) names.push(relative(root,path).split(sep).join('/'));
    }
  }
  walk(root);
  return names.sort();
}
function changedPaths(a,b) {
  const names = new Set([...treeFiles(a),...treeFiles(b)]);
  return [...names].filter((name)=>{
    const left=join(a,name),right=join(b,name);
    return !existsSync(left)||!existsSync(right)
      || !readFileSync(left).equals(readFileSync(right));
  }).sort();
}
const REGION_SOURCE = [
  "import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../core/ids.js';",
  'export function stubRegion(slotId) {',
  '  return { descriptor:{formatVersion:1,moduleId:`stub.${slotId}`,moduleVersion:1,kind:"region",slotId,featureSpecs:[]},',
  '    generate(ctx) {',
  '      const fp=parseWorldObjectId(ctx.worldId).value.configFingerprint;',
  '      const size=ctx.config.structuralConfig.cellSize;',
  '      const x=ctx.cell.ix*size+4, z=ctx.cell.iz*size+3;',
  '      const key=`${slotId}.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;',
  '      const spaceId=makeWorldObjectId("s",ctx.seed,fp,key);',
  '      const s={formatVersion:1,spaceId,worldId:ctx.worldId,ownerKind:"region",',
  '        ownerId:makeWorldObjectId("r",ctx.seed,fp,slotId),frame:{origin:{x,y:0,z}},',
  '        bounds:{min:{x,y:0,z},max:{x:x+8,y:5,z:z+8}},',
  '        levels:[{levelId:"ground",datumY:0}],volumes:[{volumeId:"air",kind:"open",levelId:"ground",',
  '          shape:{kind:"box",v:1,p:{min:{x:0,y:0,z:0},max:{x:8,y:5,z:8}}}}],',
  '        portals:[],features:[],access:"traversable"};',
  '      return {spaces:[s],traversals:[{formatVersion:1,spaceId,nodes:[],surfaces:[],links:[],blockedVolumeIds:[]}]};',
  '    }};',
  '}', '',
].join('\n');
const LANDMARK_SOURCE = [
  "import { makeWorldObjectId, parseWorldObjectId, encodeCoordinate } from '../../core/ids.js';",
  'export function stubLandmark(slotId) {',
  '  return { descriptor:{formatVersion:1,moduleId:`stub.${slotId}`,moduleVersion:1,kind:"landmark",slotId,featureSpecs:[]},',
  '    generate(ctx) {',
  '      const fp=parseWorldObjectId(ctx.worldId).value.configFingerprint;',
  '      const size=ctx.config.structuralConfig.cellSize;',
  '      const x=ctx.cell.ix*size+20, z=ctx.cell.iz*size+3;',
  '      const key=`${slotId}.${encodeCoordinate(ctx.cell.ix)}.${encodeCoordinate(ctx.cell.iz)}`;',
  '      const spaceId=makeWorldObjectId("s",ctx.seed,fp,key);',
  '      const s={formatVersion:1,spaceId,worldId:ctx.worldId,ownerKind:"landmark",',
  '        ownerId:makeWorldObjectId("l",ctx.seed,fp,slotId),frame:{origin:{x,y:0,z}},',
  '        bounds:{min:{x,y:0,z},max:{x:x+8,y:5,z:z+8}},',
  '        levels:[{levelId:"ground",datumY:0}],volumes:[{volumeId:"air",kind:"open",levelId:"ground",',
  '          shape:{kind:"box",v:1,p:{min:{x:0,y:0,z:0},max:{x:8,y:5,z:8}}}}],',
  '        portals:[],features:[],access:"traversable"};',
  '      return {spaces:[s],traversals:[{formatVersion:1,spaceId,nodes:[],surfaces:[],links:[],blockedVolumeIds:[]}]};',
  '    }};',
  '}', '',
].join('\n');
function registrySource({fifth=false,replacement=false}={}) {
  const landmarkFactory = replacement ? 'replacementLandmark' : 'stubLandmark';
  const landmarkFile = replacement ? 'replacement-landmark.js' : 'stub-landmark.js';
  const imports = [
    "import { createRegistry } from './registry.js';",
    "import { stubRegion } from './regions/stub-region.js';",
    `import { ${landmarkFactory} } from './landmarks/${landmarkFile}';`,
  ];
  if(fifth)imports.push("import { stubFifthRegion } from './regions/fifth-region.js';");
  return [...imports,
    `const fixtureRegionSlots = ${JSON.stringify(fifth?[...SLOTS,'region05']:SLOTS)};`,
    'export function createFixtureRegistry() {',
    '  const regions=fixtureRegionSlots.slice(0,4).map((slot)=>stubRegion(slot));',
    ...(fifth?['  regions.push(stubFifthRegion("region05"));']:[]),
    `  return createRegistry({regions,landmarks:[${landmarkFactory}("landmark01")]});`,
    '}', '',
  ].join('\n');
}
function entrySource() { return [
  "import { validateWorld } from '../core/world.js';",
  "import { validateSpace } from '../core/space.js';",
  "import { validateTraversal } from '../core/traversal.js';",
  "import { validateModuleDescriptor } from '../core/module.js';",
  "import { validateJourney } from '../core/journey.js';",
  "import { validateSnapshot } from '../core/snapshot.js';",
  "import { validateSave } from '../core/save.js';",
  "import { validateRender } from '../core/render.js';",
  "import { validateWorkerRequest } from '../core/worker.js';",
  "import { createFixtureRegistry } from '../modules/registry-config.js';",
  "import { composeWorld, queryWorld } from '../core/world.js';",
  "import { DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS } from '../core/space.js';",
  'export function fixtureContractTypes() {',
  '  return [validateWorld,validateSpace,validateTraversal,validateModuleDescriptor,validateJourney,validateSnapshot,validateSave,validateRender,validateWorkerRequest].map((fn)=>typeof fn);',
  '}',
  'export function fixtureRun(config, bounds) {',
  '  const outcome=createFixtureRegistry();',
  '  const registry=outcome.ok===true?outcome.value:outcome;',
  '  const built=composeWorld(config,registry,{shapeAdapters:DEFAULT_SHAPE_ADAPTERS,featureAdapters:DEFAULT_FEATURE_ADAPTERS});',
  '  if(!built.ok) return built;',
  '  return queryWorld(built.value.context,bounds);',
  '}', '',
].join('\n'); }
function makeTree(root) {
  cpSync(join(REPO,'js/v3/core'),join(root,'js/v3/core'),{recursive:true});
  mkdirSync(join(root,'js/v3/modules'),{recursive:true});
  cpSync(join(REPO,'js/v3/modules/registry.js'),join(root,'js/v3/modules/registry.js'));
  put(root,'js/v3/package.json','{"type":"module"}\n');
  put(root,'js/v3/modules/regions/stub-region.js',REGION_SOURCE);
  put(root,'js/v3/modules/landmarks/stub-landmark.js',LANDMARK_SOURCE);
  put(root,'js/v3/modules/registry-config.js',registrySource());
  put(root,'js/v3/entry/main.js',entrySource());
  put(root,'js/v3/diagnostic/index.html',[
    '<!doctype html><title>Registry fixture</title>',
    '<script type="importmap">{"imports":{"three":"./vendor/three.js"}}</script>',
    "<script type=\"module\">import './js/v3/entry/main.js';</script>",'',
  ].join('\n'));
  put(root,'index.html','<title>Legacy fixture</title><script type="module" src="js/main.js"></script>\n');
  put(root,'js/main.js','export const fixtureLegacy = true;\n');
}
function runBuild(root,out) {
  const res=spawnSync(process.execPath,[BUILDER,'--root',root,'--out',out,
    '--entry','js/v3/entry/main.js','--html','js/v3/diagnostic/index.html'],
    {cwd:REPO,encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(res.error,undefined,String(res.error));
  assert.equal(res.status,0,`real build failed: ${res.stderr}\n${res.stdout}`);
  assert.ok(existsSync(join(out,'index.html')));
}
async function fromSourceTree(root) {
  const url=pathToFileURL(join(root,'js/v3/modules/registry-config.js')).href;
  const {createFixtureRegistry}=await import(url);
  const registry=registryValue(createFixtureRegistry());
  const regions=registry.regions,landmarks=registry.landmarks;
  const config={seed:42,generatorFormat:1,
    structuralConfig:{cellSize:64,maxSpaceExtent:16},
    journeyConfig:{regionSlotIds:regions.map((r)=>r.descriptor.slotId),
      landmarkSlotIds:landmarks.map((l)=>l.descriptor.slotId),
      exitSlotId:'exit01',segments:Array(regions.length+1).fill(15),objectiveIds:[]},
    modules:[...regions,...landmarks].map(({descriptor:d})=>
      ({kind:d.kind,slotId:d.slotId,moduleId:d.moduleId,moduleVersion:d.moduleVersion})),
    adapters:[]};
  const built=ok(composeWorld(config,registry,adapters));
  return {registry,built,snap:visit(built.context)};
}

test('[P1-A06] fifth region is injected only in a temporary registry source tree', async () => {
  await tempTree(async (temp) => {
    const base=join(temp,'base'),extended=join(temp,'extended');
    makeTree(base);
    cpSync(base,extended,{recursive:true});
    const added=REGION_SOURCE.replace('function stubRegion(', 'function stubFifthRegion(');
    put(extended,'js/v3/modules/regions/fifth-region.js',added);
    put(extended,'js/v3/modules/registry-config.js',registrySource({fifth:true}));
    assert.deepEqual(changedPaths(base,extended),[
      'js/v3/modules/regions/fifth-region.js','js/v3/modules/registry-config.js']);
    assert.equal(existsSync(join(REPO,'js/v3/modules/regions/fifth-region.js')),false,
      'fixture-only fifth region must not ship');
    runBuild(base,join(temp,'base-out'));
    runBuild(extended,join(temp,'extended-out'));
    const original=await fromSourceTree(base),five=await fromSourceTree(extended);
    assert.equal(original.registry.regions.length,4);
    assert.equal(five.registry.regions.length,5);
    assert.deepEqual(five.built.descriptor.regionSlotIds,[...SLOTS,'region05']);
    assert.deepEqual(ok(resolveJourneyAnchors(five.built.context)).anchors
      .filter((a)=>a.kind==='region').map((a)=>a.slotId),[...SLOTS,'region05']);
    assert.ok(five.snap.spaces.some((s)=>s.ownerId.endsWith(':region05')),
      'fifth module must participate in real world query');
  });
});

test('[P1-A05] replacement landmark changes only its folder and static registry', async () => {
  await tempTree(async (temp) => {
    const base=join(temp,'base'),replacement=join(temp,'replacement');
    makeTree(base);
    cpSync(base,replacement,{recursive:true});
    put(replacement,'js/v3/modules/landmarks/replacement-landmark.js',
      LANDMARK_SOURCE.replace('function stubLandmark(','function replacementLandmark(')
        .replace('moduleVersion:1,kind:"landmark"','moduleVersion:2,kind:"landmark"'));
    put(replacement,'js/v3/modules/registry-config.js',registrySource({replacement:true}));
    assert.deepEqual(changedPaths(base,replacement),[
      'js/v3/modules/landmarks/replacement-landmark.js','js/v3/modules/registry-config.js']);
    runBuild(base,join(temp,'base-out'));
    runBuild(replacement,join(temp,'replacement-out'));
    const old=await fromSourceTree(base),updated=await fromSourceTree(replacement);
    assert.notEqual(old.built.descriptor.worldId,updated.built.descriptor.worldId);
    assert.deepEqual(old.built.descriptor.regionSlotIds,updated.built.descriptor.regionSlotIds);
    assert.deepEqual(localKeys(old.snap,'region'),localKeys(updated.snap,'region'));
    assert.deepEqual(localKeys(old.snap,'landmark'),localKeys(updated.snap,'landmark'));
    assert.ok(updated.snap.spaces.some((s)=>s.ownerKind==='landmark'));
  });
});
