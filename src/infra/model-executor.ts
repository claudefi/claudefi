/**
 * Model Executor with Automatic Fallback
 *
 * Provides resilient model execution by automatically falling back to
 * alternate models when the primary model is overloaded or rate limited.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParamsNonStreaming, Message } from '@anthropic-ai/sdk/resources/messages';
import {
  MODEL_CHAIN,
  isRetryableModelError,
  getModelChain,
  type ModelFallbackConfig,
} from '../config/models.js';

/**
 * Track model cooldowns and failure state
 */
interface ModelState {
  cooldownUntil: Date | null;
  consecutiveFailures: number;
  lastUsed: Date | null;
}

/**
 * Result from model execution including which model was used
 */
export interface ModelExecutionResult {
  message: Message;
  modelUsed: string;
}

/**
 * Model executor with automatic fallback on failures
 *
 * Tracks model availability and automatically falls back to alternate models
 * when the primary model experiences transient failures.
 */
export class ModelExecutor {
  private anthropic: Anthropic;
  private config: ModelFallbackConfig;
  private modelStates: Map<string, ModelState> = new Map();

  constructor(anthropic: Anthropic, config?: ModelFallbackConfig) {
    this.anthropic = anthropic;
    this.config = config || MODEL_CHAIN;

    // Initialize state for all models in the chain
    for (const model of getModelChain(this.config)) {
      this.modelStates.set(model, {
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastUsed: null,
      });
    }
  }

  /**
   * Execute a message request with automatic model fallback
   *
   * Tries each model in the chain until one succeeds. On retryable errors,
   * puts the model in cooldown and tries the next. On non-retryable errors,
   * throws immediately.
   */
  async execute(params: Omit<MessageCreateParamsNonStreaming, 'model'>): Promise<ModelExecutionResult> {
    const models = getModelChain(this.config);
    let lastError: Error | null = null;

    for (const model of models) {
      // Skip models in cooldown
      if (this.isInCooldown(model)) {
        const state = this.modelStates.get(model)!;
        const remaining = state.cooldownUntil!.getTime() - Date.now();
        console.log(`  [ModelExecutor] Skipping ${model} (cooldown: ${Math.ceil(remaining / 1000)}s remaining)`);
        continue;
      }

      try {
        console.log(`  [ModelExecutor] Trying ${model}...`);

        const message = await this.anthropic.messages.create({
          ...params,
          model,
        });

        // Success - record it and return
        this.recordSuccess(model);
        console.log(`  [ModelExecutor] Success with ${model}`);

        return { message, modelUsed: model };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        console.warn(`  [ModelExecutor] Error with ${model}: ${err.message}`);

        // Check if this is a retryable error
        if (isRetryableModelError(err)) {
          // Put model in cooldown and try next
          this.recordFailure(model);
          console.log(`  [ModelExecutor] ${model} in cooldown, trying next model...`);
          continue;
        }

        // Non-retryable error - don't waste fallback attempts
        console.error(`  [ModelExecutor] Non-retryable error, aborting fallback chain`);
        throw err;
      }
    }

    // All models failed or in cooldown
    throw lastError || new Error('All models in cooldown or unavailable');
  }

  /**
   * Get the next available model (skipping those in cooldown)
   */
  private getAvailableModel(): string | null {
    for (const model of getModelChain(this.config)) {
      if (!this.isInCooldown(model)) {
        return model;
      }
    }
    return null;
  }

  /**
   * Record a failure for a model (puts it in cooldown)
   */
  private recordFailure(model: string): void {
    const state = this.modelStates.get(model);
    if (!state) return;

    state.consecutiveFailures++;
    state.cooldownUntil = new Date(Date.now() + this.config.cooldownMs);

    console.log(
      `  [ModelExecutor] ${model} failed (${state.consecutiveFailures} consecutive), ` +
      `cooldown until ${state.cooldownUntil.toISOString()}`
    );
  }

  /**
   * Record a success for a model (resets cooldown)
   */
  private recordSuccess(model: string): void {
    const state = this.modelStates.get(model);
    if (!state) return;

    state.consecutiveFailures = 0;
    state.cooldownUntil = null;
    state.lastUsed = new Date();
  }

  /**
   * Check if a model is in cooldown
   */
  private isInCooldown(model: string): boolean {
    const state = this.modelStates.get(model);
    if (!state || !state.cooldownUntil) {
      return false;
    }

    // Check if cooldown has expired
    if (state.cooldownUntil.getTime() <= Date.now()) {
      // Cooldown expired, clear it
      state.cooldownUntil = null;
      return false;
    }

    return true;
  }

  /**
   * Get status of all models
   *
   * Returns availability and cooldown information for observability.
   */
  getModelStatus(): { model: string; available: boolean; cooldownRemaining?: number }[] {
    const models = getModelChain(this.config);
    return models.map((model) => {
      const state = this.modelStates.get(model);
      const available = !this.isInCooldown(model);

      const status: { model: string; available: boolean; cooldownRemaining?: number } = {
        model,
        available,
      };

      if (!available && state?.cooldownUntil) {
        status.cooldownRemaining = Math.max(
          0,
          Math.ceil((state.cooldownUntil.getTime() - Date.now()) / 1000)
        );
      }

      return status;
    });
  }

  /**
   * Clear all cooldowns (useful for testing or manual recovery)
   */
  clearCooldowns(): void {
    const models = getModelChain(this.config);
    for (const model of models) {
      const state = this.modelStates.get(model);
      if (state) {
        state.cooldownUntil = null;
        state.consecutiveFailures = 0;
      }
    }
    console.log('  [ModelExecutor] All cooldowns cleared');
  }

  /**
   * Get the primary model (first in chain)
   */
  getPrimaryModel(): string {
    return this.config.primary;
  }

  /**
   * Check if any model is available
   */
  hasAvailableModel(): boolean {
    return this.getAvailableModel() !== null;
  }
}

/**
 * Factory function for easy use
 */
export function createModelExecutor(
  anthropic: Anthropic,
  config?: ModelFallbackConfig
): ModelExecutor {
  return new ModelExecutor(anthropic, config);
}
