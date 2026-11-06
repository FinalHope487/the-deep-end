// Composition file: the default registry. To add a region or replace a landmark, add its folder
// under modules/ and edit only the imports and the lists below (and journey-config.js slots).
import { createRegistry } from './registry.js';
import { stubRegion } from './regions/stub-region.js';
import { stubLandmark } from './landmarks/stub-landmark.js';

// -> Result<Registry>
export function createDefaultRegistry() {
  return createRegistry({
    regions: ['region01', 'region02', 'region03', 'region04'].map((slotId) => stubRegion(slotId)),
    landmarks: [stubLandmark('landmark01')],
  });
}
