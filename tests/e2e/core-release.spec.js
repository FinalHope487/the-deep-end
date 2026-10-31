import { test, expect } from '@playwright/test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.cwd());
const WORK = join(ROOT, 'work');
const PREFIX = '.resident-release-';

const TEST_TIMEOUT_MS = 35_000;
const BOOT_TIMEOUT_MS = 27_000;

test.setTimeout(TEST_TIMEOUT_MS);

function cleanupOwnPreviousRuns() {
  mkdirSync(WORK, { recursive: true });

  for (const entry of readdirSync(WORK, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(PREFIX)) continue;

    const path = resolve(WORK, entry.name);

    if (
      path === WORK ||
      !path.startsWith(WORK + sep)
    ) {
      throw new Error('Unsafe temporary cleanup path');
    }

    rmSync(path, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

function buildTemporaryRelease() {
  cleanupOwnPreviousRuns();

  const output = mkdtempSync(join(WORK, PREFIX));

  try {
    execFileSync(process.execPath, [
      resolve(ROOT, 'tools/build.mjs'),
      '--root',
      ROOT,
      '--out',
      output,
    ], {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 15_000,
    });

    if (!existsSync(join(output, 'index.html'))) {
      throw new Error(
        'Fresh release has no index.html'
      );
    }

    if (!existsSync(join(
      output,
      'js',
      'gen2-s2-worker.js'
    ))) {
      throw new Error(
        'Fresh release has no S2 Worker module'
      );
    }

    const relativePath = relative(ROOT, output)
      .split(sep)
      .join('/');

    if (
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      relativePath.startsWith('/')
    ) {
      throw new Error(
        'Temporary release escaped project root'
      );
    }

    return {
      output,
      path: `/${relativePath}/index.html`,
    };
  } catch (error) {
    rmSync(output, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    throw error;
  }
}

async function diagnosticState(page) {
  try {
    return await page.evaluate(() => {
      const api = window.__deepend;

      let state = null;

      if (api && typeof api.state === 'function') {
        try {
          const current = api.state();

          state = {
            gen: current.gen,
            mode: current.mode,
            loadedChunks: current.loadedChunks,
            pendingChunks: current.pendingChunks,
          };
        } catch (error) {
          state = {
            error: String(error),
          };
        }
      }

      return {
        url: location.pathname,
        readyState: document.readyState,
        testApiExists: Boolean(api),
        ready: api?.ready ?? null,
        booted: window.__deepEndBooted === true,
        titleVisible: Boolean(
          document.querySelector('#title')
        ),
        state,
      };
    });
  } catch (error) {
    return {
      diagnosticError: String(error),
    };
  }
}

test(
  'release: core game boots and responds in a fresh distribution',
  async ({ page }) => {
    let release = null;

    const pageErrors = [];
    const consoleErrors = [];
    const requestFailures = [];

    page.on('pageerror', error => {
      pageErrors.push(String(error));
    });

    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    page.on('requestfailed', request => {
      requestFailures.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? '',
      });
    });

    const startedAt = Date.now();

    try {
      release = buildTemporaryRelease();

      const url = `${release.path}?test=1&seed=42`;

      // "commit" waits for the HTTP response, not all
      // external modules and media.
      const response = await page.goto(url, {
        waitUntil: 'commit',
        timeout: 8_000,
      });

      expect(response).not.toBeNull();
      expect(response.status()).toBe(200);

      await page.waitForFunction(
        () => window.__deepend?.ready === true,
        null,
        {
          timeout: BOOT_TIMEOUT_MS,
          polling: 100,
        }
      );

      const boot = await diagnosticState(page);

      expect(boot.testApiExists).toBe(true);
      expect(boot.ready).toBe(true);
      expect(boot.state?.gen).toBe(1);
      expect(boot.state?.loadedChunks).toBeGreaterThan(0);

      // The merged release must not load source
      // application scripts through script[src].
      expect(
        await page.locator('script[src]').count()
      ).toBe(0);

      await page.getByRole('button', {
        name: '開始',
        exact: true,
      }).click({ timeout: 3_000 });

      await expect.poll(
        () => page.evaluate(
          () => window.__deepend.state().mode
        ),
        {
          timeout: 3_000,
          intervals: [100, 200],
        }
      ).toBe('playing');

      const before = await page.evaluate(
        () => window.__deepend.state()
      );

      await page.keyboard.down('w');

      try {
        await page.waitForTimeout(400);
      } finally {
        await page.keyboard.up('w');
      }

      const after = await page.evaluate(
        () => window.__deepend.state()
      );

      expect(after.gen).toBe(1);
      expect(after.mode).toBe('playing');
      expect(after.loadedChunks).toBeGreaterThan(0);

      expect(
        Math.hypot(
          after.x - before.x,
          after.z - before.z
        )
      ).toBeGreaterThan(0.15);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);

      console.log(
        'Resident release boot and input passed',
        JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          loadedChunks: after.loadedChunks,
        })
      );
    } catch (error) {
      console.log(
        'RESIDENT_RELEASE_DIAGNOSTIC',
        JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          page: await diagnosticState(page),
          pageErrors,
          consoleErrors,
          requestFailures: requestFailures.slice(0, 20),
          failure: String(error),
        }, null, 2)
      );

      throw error;
    } finally {
      // Release file handles before removing the output.
      await page.goto('about:blank', {
        waitUntil: 'commit',
        timeout: 2_000,
      }).catch(() => {});

      if (release !== null) {
        rmSync(release.output, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      }
    }
  }
);
