/**
 * Config utility for loading and saving TUI configuration
 * Config is stored at ~/.claudefi/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Domain } from '../context/AppContext.js';

export interface TuiConfig {
  mode: 'paper' | 'live';
  cycleInterval: number;
  activeDomains: Domain[];
  confidenceThreshold: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.claudefi');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const defaultConfig: TuiConfig = {
  mode: 'paper',
  cycleInterval: 1800000, // 30 minutes
  activeDomains: ['dlmm', 'perps', 'polymarket', 'spot'],
  confidenceThreshold: 0.6,
};

/**
 * Load config from ~/.claudefi/config.json
 * Returns default config if file doesn't exist or is invalid
 */
export function loadConfig(): TuiConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return defaultConfig;
    }

    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TuiConfig>;

    // Merge with defaults to ensure all fields exist
    return {
      mode: parsed.mode === 'live' ? 'live' : 'paper',
      cycleInterval: typeof parsed.cycleInterval === 'number'
        ? parsed.cycleInterval
        : defaultConfig.cycleInterval,
      activeDomains: Array.isArray(parsed.activeDomains)
        ? parsed.activeDomains.filter((d): d is Domain =>
            ['dlmm', 'perps', 'polymarket', 'spot'].includes(d)
          )
        : defaultConfig.activeDomains,
      confidenceThreshold: typeof parsed.confidenceThreshold === 'number'
        ? Math.max(0, Math.min(1, parsed.confidenceThreshold))
        : defaultConfig.confidenceThreshold,
    };
  } catch {
    return defaultConfig;
  }
}

/**
 * Save config to ~/.claudefi/config.json
 */
export function saveConfig(config: TuiConfig): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

/**
 * Format cycle interval for display
 */
export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMins}m`;
}

/**
 * Parse interval string to milliseconds
 */
export function parseInterval(str: string): number {
  const num = parseInt(str, 10);
  if (isNaN(num)) return defaultConfig.cycleInterval;
  return num * 60000; // Convert minutes to ms
}
