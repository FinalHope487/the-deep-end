// Check IDs: P0-B09
import { entryValue } from './core/entry.js';

const fixtureStatus = document.getElementById('fixture-status');
if (!fixtureStatus) throw new Error('P0-B09: #fixture-status is missing');
if (entryValue !== 43) throw new Error(`P0-B09: entryValue=${entryValue}; expected 43`);
fixtureStatus.dataset.ready = 'true';
fixtureStatus.textContent = `ready:${entryValue}`;
window.__p0NestedReady = true;
