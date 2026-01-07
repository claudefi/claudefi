/**
 * Domain Prompts Index
 * Rich context builders for each trading domain
 */

export { buildDLMMSystemPrompt, buildDLMMUserPrompt } from './dlmm.js';
export { buildPerpsSystemPrompt, buildPerpsUserPrompt } from './perps.js';
export { buildPolymarketSystemPrompt, buildPolymarketUserPrompt } from './polymarket.js';
export { buildSpotSystemPrompt, buildSpotUserPrompt } from './spot.js';

import type { Domain, DomainContext } from '../types/index.js';
import { buildDLMMSystemPrompt, buildDLMMUserPrompt } from './dlmm.js';
import { buildPerpsSystemPrompt, buildPerpsUserPrompt } from './perps.js';
import { buildPolymarketSystemPrompt, buildPolymarketUserPrompt } from './polymarket.js';
import { buildSpotSystemPrompt, buildSpotUserPrompt } from './spot.js';

/**
 * Get system prompt for a domain
 */
export function getSystemPrompt(domain: Domain): string {
  switch (domain) {
    case 'dlmm':
      return buildDLMMSystemPrompt();
    case 'perps':
      return buildPerpsSystemPrompt();
    case 'polymarket':
      return buildPolymarketSystemPrompt();
    case 'spot':
      return buildSpotSystemPrompt();
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}

/**
 * Get user prompt for a domain with context
 */
export function getUserPrompt(domain: Domain, context: DomainContext): string {
  switch (domain) {
    case 'dlmm':
      return buildDLMMUserPrompt(context);
    case 'perps':
      return buildPerpsUserPrompt(context);
    case 'polymarket':
      return buildPolymarketUserPrompt(context);
    case 'spot':
      return buildSpotUserPrompt(context);
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}
