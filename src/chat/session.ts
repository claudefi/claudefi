/**
 * Agent Chat Session
 *
 * Shared helper that powers both the CLI chat command and the TUI agent chat.
 * Handles Anthropic messaging, tool execution, and conversation history.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import { buildChatSystemPrompt } from './chat-prompt.js';
import { contextTools, handleContextTool } from './context-server.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_TURNS = 20;
const PROMPT_REFRESH_INTERVAL_MS = 60_000;

export interface ChatSendCallbacks {
  onToolCall?: (info: { name: string }) => void;
  onToolResult?: (info: { name: string; result: string }) => void;
}

export interface ChatSendResult {
  response: string;
}

/**
 * Converts the MCP context tools to the Anthropic SDK format.
 */
function getAnthropicTools(): Tool[] {
  return contextTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool['input_schema'],
  }));
}

/**
 * Execute a tool call and return a JSON-encoded response.
 */
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    const result = await handleContextTool(name, input);
    return JSON.stringify(result, null, 2);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run a single conversation turn, including tool handling, for a given session.
 */
async function runConversationTurn(
  anthropic: Anthropic,
  systemPrompt: string,
  messageHistory: MessageParam[],
  tools: Tool[],
  callbacks?: ChatSendCallbacks
): Promise<{ response: string; updatedMessages: MessageParam[] }> {
  let currentMessages = [...messageHistory];
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: currentMessages,
      tools,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      );

      currentMessages.push({ role: 'assistant', content: response.content });

      const toolResults: ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        callbacks?.onToolCall?.({ name: toolUse.name });
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        callbacks?.onToolResult?.({ name: toolUse.name, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      currentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(
        (block): block is TextBlock => block.type === 'text'
      );
      const responseText = textBlocks.map(block => block.text).join('\n');

      currentMessages.push({ role: 'assistant', content: response.content });

      return {
        response: responseText,
        updatedMessages: currentMessages,
      };
    }

    console.warn(`Unexpected stop reason: ${response.stop_reason}`);
    break;
  }

  return {
    response: 'Sorry, I ran into an issue processing that request.',
    updatedMessages: messageHistory,
  };
}

/**
 * AgentChatSession maintains conversation history and exposes a simple API for sending messages.
 */
export class AgentChatSession {
  private anthropic: Anthropic;
  private systemPrompt: string | null = null;
  private tools: Tool[] = [];
  private messages: MessageParam[] = [];
  private ready = false;
  private lastPromptRefresh = 0;

  private constructor(anthropic?: Anthropic) {
    this.anthropic = anthropic ?? new Anthropic();
  }

  static async create(anthropic?: Anthropic): Promise<AgentChatSession> {
    const session = new AgentChatSession(anthropic);
    await session.initialize();
    return session;
  }

  private async initialize(): Promise<void> {
    this.tools = getAnthropicTools();
    await this.refreshSystemPrompt(true);
    this.ready = true;
  }

  private async refreshSystemPrompt(force = false): Promise<void> {
    const now = Date.now();
    const needsRefresh =
      !this.systemPrompt ||
      force ||
      now - this.lastPromptRefresh > PROMPT_REFRESH_INTERVAL_MS;

    if (needsRefresh) {
      this.systemPrompt = await buildChatSystemPrompt();
      this.lastPromptRefresh = now;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  clear(): void {
    this.messages = [];
  }

  async sendMessage(
    content: string,
    callbacks?: ChatSendCallbacks
  ): Promise<ChatSendResult> {
    if (!this.ready || !this.systemPrompt) {
      await this.initialize();
    }

    await this.refreshSystemPrompt();

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Message content cannot be empty.');
    }

    this.messages.push({ role: 'user', content: trimmed });

    try {
      const { response, updatedMessages } = await runConversationTurn(
        this.anthropic,
        this.systemPrompt!,
        this.messages,
        this.tools,
        callbacks
      );

      this.messages = updatedMessages;
      return { response };
    } catch (error) {
      this.messages.pop();
      throw error;
    }
  }
}

export default AgentChatSession;
