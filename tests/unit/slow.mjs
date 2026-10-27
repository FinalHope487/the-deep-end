// Slow tier marker (docs/testing.md): pass `slow` as the options argument of a test that takes 10 s or more alone.
// The default run skips it. `npm run test:unit:full` loads tests/slow.env, which sets TEST_SLOW=1 and runs it.
export const slow = process.env.TEST_SLOW ? {} : { skip: 'slow tier: run npm run test:unit:full (docs/testing.md)' };
