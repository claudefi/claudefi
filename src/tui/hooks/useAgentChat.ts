/**
 * useAgentChat Hook
 *
 * Provides a persistent chat session with claudefi for the TUI.
 * Handles session lifecycle, message history, and tool call events.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentChatSession } from '../../chat/session.js';

export type AgentChatMessageRole = 'user' | 'assistant' | 'system';

export interface AgentChatMessage {
  id: string;
  role: AgentChatMessageRole;
  text: string;
}

export type AgentChatStatus = 'initializing' | 'ready' | 'sending' | 'error';

export interface UseAgentChatResult {
  messages: AgentChatMessage[];
  status: AgentChatStatus;
  error: string | null;
  isReady: boolean;
  sendMessage: (input: string) => Promise<boolean>;
  clear: () => void;
  reconnect: () => void;
  pushSystemMessage: (text: string) => void;
}

const MAX_HISTORY = 40;
const MAX_VISIBLE = 5;
const MAX_TEXT_LENGTH = 160;

function formatMessageText(text: string): string {
  if (!text) return '';
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (!singleLine) return '';
  if (singleLine.length <= MAX_TEXT_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_TEXT_LENGTH - 1)}…`;
}

function createMessage(role: AgentChatMessageRole, text: string): AgentChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text: formatMessageText(text),
  };
}

export function useAgentChat(): UseAgentChatResult {
  const [session, setSession] = useState<AgentChatSession | null>(null);
  const [status, setStatus] = useState<AgentChatStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setStatus('initializing');
      setError(null);

      try {
        const newSession = await AgentChatSession.create();
        if (cancelled) {
          return;
        }
        setSession(newSession);
        setStatus('ready');
      } catch (err) {
        if (cancelled) {
          return;
        }
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to start chat session');
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const appendMessage = useCallback((message: AgentChatMessage) => {
    setMessages(prev => {
      const next = [...prev, message];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, []);

  const pushSystemMessage = useCallback((text: string) => {
    appendMessage(createMessage('system', text));
  }, [appendMessage]);

  const sendMessage = useCallback(async (input: string): Promise<boolean> => {
    if (!session) {
      pushSystemMessage('Chat session is still starting. Please wait…');
      return false;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return false;
    }

    appendMessage(createMessage('user', trimmed));

    setStatus('sending');
    setError(null);

    try {
      const { response } = await session.sendMessage(trimmed, {
        onToolCall: ({ name }) => appendMessage(createMessage('system', `🔧 ${name}`)),
        onToolResult: ({ name }) => appendMessage(createMessage('system', `✅ ${name}`)),
      });

      appendMessage(createMessage('assistant', response.trim() || '(no response)'));

      setStatus('ready');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat request failed';
      appendMessage(createMessage('system', `⚠️ ${message}`));
      setError(message);
      setStatus('ready');
      return false;
    }
  }, [appendMessage, session, pushSystemMessage]);

  const clear = useCallback(() => {
    session?.clear();
    setMessages([]);
    setError(null);
  }, [session]);

  const reconnect = useCallback(() => {
    setSession(null);
    setMessages([]);
    setAttempt(prev => prev + 1);
  }, []);

  const visibleMessages = useMemo(
    () => messages.slice(-MAX_VISIBLE),
    [messages]
  );

  return {
    messages: visibleMessages,
    status,
    error,
    isReady: status === 'ready',
    sendMessage,
    clear,
    reconnect,
    pushSystemMessage,
  };
}

export default useAgentChat;
