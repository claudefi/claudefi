#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * Renders the claudefi TUI dashboard using Ink.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// Clear screen before rendering
process.stdout.write('\x1B[2J\x1B[0f');

// Render the app
const { waitUntilExit } = render(<App />);

// Handle exit
waitUntilExit().then(() => {
  console.log('\nGoodbye! 👋');
  process.exit(0);
});
