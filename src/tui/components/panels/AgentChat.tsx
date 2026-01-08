/**
 * AgentChat Component
 *
 * Embedded chat experience inside the Agent Activity panel.
 * Lets operators talk to claudefi without leaving the dashboard.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { useAgentChat } from '../../hooks/useAgentChat.js';
import { useAppContext } from '../../context/AppContext.js';

const ROLE_COLORS: Record<string, string> = {
  user: 'cyan',
  assistant: 'green',
  system: 'gray',
};

export const AgentChat: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const panelFocused = state.focusedPanel === 2;
  const [inputActive, setInputActive] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { messages, status, error, sendMessage, clear, pushSystemMessage, reconnect } = useAgentChat();

  // Automatically drop out of chat mode if panel focus changes
  useEffect(() => {
    if (!panelFocused && inputActive) {
      setInputActive(false);
      setInputValue('');
    }
  }, [panelFocused, inputActive]);

  // Toggle input capture so global shortcuts pause while typing
  useEffect(() => {
    const captureActive = state.inputCapture === 'chat';
    if (panelFocused && inputActive && !captureActive) {
      dispatch({ type: 'SET_INPUT_CAPTURE', capture: 'chat' });
    } else if ((!panelFocused || !inputActive) && captureActive) {
      dispatch({ type: 'SET_INPUT_CAPTURE', capture: null });
    }
  }, [dispatch, inputActive, panelFocused, state.inputCapture]);

  useInput((_, key) => {
    if (!panelFocused) {
      return;
    }
    if (!inputActive && key.return) {
      setInputActive(true);
      return;
    }
    if (inputActive && key.escape) {
      setInputActive(false);
      setInputValue('');
      return;
    }
  }, { isActive: panelFocused });

  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === '/clear') {
      clear();
      pushSystemMessage('Conversation cleared.');
      setInputValue('');
      return;
    }

    if (trimmed === '/help') {
      pushSystemMessage('Commands: /clear, /help, /retry');
      setInputValue('');
      return;
    }

    if (trimmed === '/retry') {
      pushSystemMessage('Reconnecting chat session…');
      reconnect();
      setInputValue('');
      return;
    }

    await sendMessage(trimmed);
    setInputValue('');
  }, [clear, pushSystemMessage, reconnect, sendMessage]);

  const instruction = inputActive
    ? 'Esc to cancel • Enter to send'
    : 'Press Enter to start chatting';

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1} paddingY={0}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="white">Agent Chat</Text>
        <Text dimColor>{instruction}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {messages.length === 0 ? (
          <Text dimColor>No messages yet. Start by asking claudefi about your portfolio.</Text>
        ) : (
          messages.map(message => (
            <Box key={message.id}>
              <Box width={9}>
                <Text color={ROLE_COLORS[message.role] || 'white'}>
                  {message.role === 'user' && 'you'}
                  {message.role === 'assistant' && 'claudefi'}
                  {message.role === 'system' && 'system'}
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text wrap="truncate">{message.text}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          {inputActive ? (
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              focus={inputActive && panelFocused}
              placeholder="Ask anything..."
            />
          ) : (
            <Text dimColor>Focus panel + press Enter to chat.</Text>
          )}
        </Box>

        <Box marginTop={1} justifyContent="space-between" alignItems="center">
          <Box>
            {status === 'initializing' && (
              <Text color="yellow"><Spinner type="dots" /> connecting…</Text>
            )}
            {status === 'sending' && (
              <Text color="cyan"><Spinner type="dots" /> thinking…</Text>
            )}
            {status === 'error' && (
              <Text color="red">⚠️ {error || 'Chat unavailable'}</Text>
            )}
          </Box>
          <Text dimColor>/help for commands</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default AgentChat;
