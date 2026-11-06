// Composition file: the default adapter tables handed to composeWorld.
import { DEFAULT_SHAPE_ADAPTERS, DEFAULT_FEATURE_ADAPTERS } from '../core/space.js';

export function createDefaultAdapters() {
  return { shapeAdapters: DEFAULT_SHAPE_ADAPTERS, featureAdapters: DEFAULT_FEATURE_ADAPTERS };
}
