import { Message } from "./api";

interface MessageContext {
  originalQuestion: string;
  relevantHistory: Message[];
  hasFailedAttempts: boolean;
  lastUserMessage: Message | null;
  debug?: {
    messageCount: number;
    userMessageCount: number;
    processedAt: string;
    hasOriginalQuestion: boolean;
    hasFailedAttempts: boolean;
    historyLength: number;
  };
}

const isValidMessage = (message: Message): boolean => {
  return (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    'content' in message &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  );
};

const isSystemMessage = (message: Message): boolean => {
  return (
    message.type === 'system' &&
    (
      message.content.includes('🤔') ||
      message.content.includes('Processing') ||
      message.content.includes('Architect') ||
      message.content.includes('Thinking') ||
      message.content.includes('⚠️') ||
      message.content.includes('Send Back to Engineer')
    )
  );
};

export const processMessageContext = (messages: Message[]): MessageContext => {
  const userMessages = messages.filter(m => m.type === 'user');
  const originalQuestion = userMessages[0]?.content || '';
  const lastUserMessage = userMessages[userMessages.length - 1] || null;
  
  // Include all messages in relevant history, maintaining chronological order
  const relevantHistory = messages.map(m => ({
    type: m.type,
    content: m.content
  }));

  // Check for failed attempts by looking for error messages or architect escalations
  const hasFailedAttempts = messages.some(m => 
    (m.type === 'system' && (
      m.content.includes('Error') || 
      m.content.includes('Failed') ||
      m.content.includes('Retrying') ||
      m.content.includes('escalat')
    ))
  );

  const context: MessageContext = {
    originalQuestion,
    relevantHistory,
    hasFailedAttempts,
    lastUserMessage,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    processedAt: new Date().toISOString(),
    hasOriginalQuestion: !!originalQuestion,
    historyLength: relevantHistory.length
  };

  // Add debug information
  context.debug = {
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    processedAt: new Date().toISOString(),
    hasOriginalQuestion: !!originalQuestion,
    hasFailedAttempts,
    historyLength: relevantHistory.length
  };

  return context;
};

export const formatMessagesForArchitect = (context: MessageContext): string => {
  const sections = [
    '=== ORIGINAL QUESTION ===',
    context.originalQuestion || 'No original question found',
    '',
    '=== CURRENT STATUS ===',
    `Messages: ${context.messageCount}`,
    `User Messages: ${context.userMessageCount}`,
    `Failed Attempts: ${context.hasFailedAttempts ? 'Yes' : 'No'}`,
    '',
    '=== CURRENT QUESTION ===',
    context.lastUserMessage?.content || context.originalQuestion || 'No question found',
    '',
    '=== COMPLETE CONVERSATION HISTORY ===',
    ...context.relevantHistory.map((m, i) => {
      const timestamp = new Date(context.processedAt).toISOString();
      let prefix;
      switch (m.type) {
        case 'user':
          prefix = '👤 User:';
          break;
        case 'answer':
          prefix = '🤖 Assistant:';
          break;
        case 'reasoning':
          prefix = '💭 Reasoning:';
          break;
        case 'system':
          prefix = '⚙️ System:';
          break;
        default:
          prefix = '📝';
      }
      return `[${timestamp}] ${prefix} ${m.content}`;
    }),
    '',
    '=== DEBUG INFO ===',
    JSON.stringify(context.debug, null, 2)
  ];

  return sections.join('\n');
};

export const validateMessageChain = (messages: Message[]): boolean => {
  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn('Invalid or empty message chain');
    return false;
  }

  const userMessages = messages.filter(m => m.type === 'user');
  if (userMessages.length === 0) {
    console.warn('No user messages found in chain');
    return false;
  }

  const validMessages = messages.filter(isValidMessage);
  if (validMessages.length !== messages.length) {
    console.warn('Some messages in chain are invalid');
    return false;
  }

  return true;
};

export const extractCodeFromMessages = (messages: Message[]): string => {
  if (!validateMessageChain(messages)) {
    console.warn('Invalid message chain for code extraction');
    return '';
  }

  return messages
    .filter(m => m.type === 'answer')
    .map(m => {
      try {
        const codeBlocks = m.content.match(/```(?:html|javascript|js|typescript|ts)?\n([\s\S]*?)```/g);
        if (codeBlocks) {
          return codeBlocks
            .map(block => block.replace(/```(?:html|javascript|js|typescript|ts)?\n|```/g, ''))
            .join('\n\n');
        }
      } catch (error) {
        console.warn('Error extracting code from message:', error);
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}; 