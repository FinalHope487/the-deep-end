import test from 'node:test';
import assert from 'node:assert/strict';
import {s2TileAt,s2TilesNear} from '../../js/gen2-s2-client.js';
test('visible tile requests use fixed ownership across zero and negative boundaries',()=>{
  assert.equal(s2TileAt(-.01,-.01),'zt:-1,-1');assert.equal(s2TileAt(512,0),'zt:1,0');
  assert.deepEqual(s2TilesNear(0,0,1),['zt:-1,-1','zt:-1,0','zt:0,-1','zt:0,0']);
  assert.deepEqual(s2TilesNear(700,-400,30),['zt:1,-1']);
});
