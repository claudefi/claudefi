/**
 * Hook Registry
 *
 * Central registry for hook registration and execution.
 * Hooks are run in priority order (lower priority = runs first).
 */

import type { HookEvent, Hook, HookContext, HookResult, HookEntry, HookExecutionSummary } from './types.js';
import type { Domain } from '../types/index.js';

class HookRegistry {
  private hooks: HookEntry[] = [];
  private executionLog: HookExecutionSummary[] = [];
  private maxLogSize = 100;

  /**
   * Register a new hook
   */
  register(entry: HookEntry): void {
    // Check for duplicate names
    if (this.hooks.some(h => h.name === entry.name)) {
      console.warn(`[Hooks] Hook "${entry.name}" already registered, skipping`);
      return;
    }

    this.hooks.push(entry);
    // Sort by priority (ascending)
    this.hooks.sort((a, b) => a.priority - b.priority);
    console.log(`[Hooks] Registered: ${entry.name} (${entry.event}, priority ${entry.priority})`);
  }

  /**
   * Unregister a hook by name
   */
  unregister(name: string): boolean {
    const index = this.hooks.findIndex(h => h.name === name);
    if (index >= 0) {
      this.hooks.splice(index, 1);
      console.log(`[Hooks] Unregistered: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Enable or disable a hook
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const hook = this.hooks.find(h => h.name === name);
    if (hook) {
      hook.enabled = enabled;
      console.log(`[Hooks] ${name} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Run all applicable hooks for an event
   * Returns a combined result - proceeds only if ALL hooks proceed
   */
  async run(event: HookEvent, ctx: HookContext): Promise<HookResult> {
    const applicable = this.hooks
      .filter(h => h.event === event && h.enabled)
      .filter(h => !h.domains || h.domains.includes(ctx.domain));

    if (applicable.length === 0) {
      return { proceed: true };
    }

    let currentInput = ctx.toolInput;
    let combinedMetadata: Record<string, unknown> = {};

    for (const entry of applicable) {
      const start = Date.now();
      try {
        const contextWithInput = { ...ctx, toolInput: currentInput };
        const result = await entry.hook(contextWithInput);
        const durationMs = Date.now() - start;

        // Log execution
        this.logExecution({
          hookName: entry.name,
          event,
          domain: ctx.domain,
          proceeded: result.proceed,
          reason: result.reason,
          durationMs,
          timestamp: new Date(),
        });

        // If any hook blocks, stop and return
        if (!result.proceed) {
          console.log(`[Hooks] ${entry.name} BLOCKED: ${result.reason}`);
          return result;
        }

        // Accumulate modifications
        if (result.modifiedInput !== undefined) {
          currentInput = result.modifiedInput;
        }
        if (result.metadata) {
          combinedMetadata = { ...combinedMetadata, ...result.metadata };
        }
      } catch (error) {
        const durationMs = Date.now() - start;
        console.error(`[Hooks] Error in ${entry.name}:`, error);
        this.logExecution({
          hookName: entry.name,
          event,
          domain: ctx.domain,
          proceeded: false,
          reason: `Hook error: ${error instanceof Error ? error.message : String(error)}`,
          durationMs,
          timestamp: new Date(),
        });
        // Hook errors block by default (fail-safe)
        return { proceed: false, reason: `Hook error in ${entry.name}` };
      }
    }

    return {
      proceed: true,
      modifiedInput: currentInput,
      metadata: Object.keys(combinedMetadata).length > 0 ? combinedMetadata : undefined,
    };
  }

  /**
   * Get all registered hooks
   */
  getHooks(): HookEntry[] {
    return [...this.hooks];
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(event: HookEvent): HookEntry[] {
    return this.hooks.filter(h => h.event === event);
  }

  /**
   * Get recent execution log
   */
  getExecutionLog(limit = 20): HookExecutionSummary[] {
    return this.executionLog.slice(-limit);
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.hooks = [];
    this.executionLog = [];
  }

  private logExecution(summary: HookExecutionSummary): void {
    this.executionLog.push(summary);
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog.shift();
    }
  }
}

// Singleton instance
export const hookRegistry = new HookRegistry();
