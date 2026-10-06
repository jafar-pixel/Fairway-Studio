// Execute the production helper. Never stub an origin decision in route tests.
import { loadModule } from './media-test-harness.mjs';
export const requestOrigin = loadModule('lib/studio/request-origin.ts');
