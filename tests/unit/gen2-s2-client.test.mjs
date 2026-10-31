import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S2Planner } from '../../js/gen2-s2-client.js';

function completed(tile, index) {
  return {
    seed: 42,
    tile,
    result: {
      seed: 42,
      tile,
      snapshot: {
        sealed: [`edge:${index}`],
      },
    },
    fragments: new Map([
      [`${index},0`, { parts: [index] }],
    ]),
    promise: Promise.resolve(),
  };
}

test('planner failure rejects queued and running requests and permits a fresh retry', async () => {
  const oldWorker = globalThis.Worker;
  const oldDocument = globalThis.document;
  const workers = [];

  globalThis.document = {
    baseURI: 'http://localhost/',
  };

  globalThis.Worker = class {
    constructor() {
      workers.push(this);
    }

    postMessage(message) {
      this.message = message;
    }

    terminate() {
      this.terminated = true;
    }
  };

  const planner = new S2Planner();

  try {
    const requests = [0, 1, 2].map(i =>
      planner.request(42, `zt:${i},0`)
    );

    const failures = requests.map(p =>
      assert.rejects(p, /Disconnected/)
    );

    planner.fail(new Error('Disconnected'));

    await Promise.all(failures);

    assert.ok(
      workers.every(w => w.terminated),
      'failed workers were not terminated'
    );

    const retry = planner.request(42, 'zt:2,0');
    const worker = workers.at(-2);
    const data = completed('zt:2,0', 2);

    assert.ok(
      worker && worker.message,
      'retry did not dispatch a Worker request'
    );

    worker.onmessage({
      data: {
        type: 'complete',
        id: worker.message.id,
        result: data.result,
        fragments: data.fragments,
      },
    });

    await retry;

    assert.ok(
      planner.worldOptions(42).tiles.has('zt:2,0'),
      'recovery did not publish the completed tile'
    );
  } finally {
    planner.fail(new Error('Test cleanup'));
    globalThis.Worker = oldWorker;
    globalThis.document = oldDocument;
  }
});