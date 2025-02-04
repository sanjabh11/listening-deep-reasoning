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
    messageTypeBreakdown: Record<string, number>;
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

const MESSAGE_PREFIXES: Record<string, string> = {
  user: '👤 User',
  answer: '🤖 Solution',
  reasoning: '💭 Analysis',
  system: '⚙️ System'
};

const formatMessageContent = (message: Message): string => {
  // Remove any existing emoji prefixes
  let content = message.content.replace(/^[👤🤖💭⚙️📝]\s*/, '');
  
  // Format based on message type
  switch (message.type) {
    case 'reasoning':
    case 'answer':
      // Ensure consistent markdown formatting
      if (!content.startsWith('###')) {
        content = content.split('\n').map(line => {
          if (line.match(/^\d+\./)) {
            return `### ${line}`;
          }
          return line;
        }).join('\n');
      }
      break;
    case 'system':
      // Clean up system messages
      content = content.replace(/^Architect Review:\s*/, '');
      break;
  }
  
  return content;
};

export const processMessageContext = (messages: Message[]): MessageContext => {
  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn('Invalid or empty message array');
    return createEmptyContext();
  }

  // Filter and validate user messages
  const userMessages = messages.filter(m => m.type === 'user');
  if (userMessages.length === 0) {
    console.warn('No user messages found in chain');
    return createEmptyContext();
  }

  const originalQuestion = userMessages[0]?.content || '';
  const lastUserMessage = userMessages[userMessages.length - 1] || null;

  // Group messages by type for better organization
  const messagesByType = messages.reduce((acc, m) => {
    acc[m.type] = acc[m.type] || [];
    acc[m.type].push(m);
    return acc;
  }, {} as Record<string, Message[]>);

  // Check for failed attempts or errors
  const hasFailedAttempts = messages.some(m => 
    (m.type === 'system' && (
      m.content.includes('Error') || 
      m.content.includes('Failed') ||
      m.content.includes('Retrying') ||
      m.content.includes('escalat')
    ))
  );

  // Create debug information
  const debug = {
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    processedAt: new Date().toISOString(),
    hasOriginalQuestion: !!originalQuestion,
    hasFailedAttempts,
    historyLength: messages.length,
    messageTypeBreakdown: Object.fromEntries(
      Object.entries(messagesByType).map(([type, msgs]) => [type, msgs.length])
    )
  };

  // Log context processing for debugging
  console.debug('Processing message context:', {
    messageCount: messages.length,
    messageTypes: Object.keys(messagesByType),
    hasUserMessages: userMessages.length > 0,
    hasOriginalQuestion: !!originalQuestion,
    debug
  });

  return {
    originalQuestion,
    relevantHistory: messages,
    hasFailedAttempts,
    lastUserMessage,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    processedAt: new Date().toISOString(),
    hasOriginalQuestion: !!originalQuestion,
    historyLength: messages.length,
    debug
  };
};

const createEmptyContext = (): MessageContext => ({
  originalQuestion: '',
  relevantHistory: [],
  hasFailedAttempts: false,
  lastUserMessage: null,
  messageCount: 0,
  userMessageCount: 0,
  processedAt: new Date().toISOString(),
  hasOriginalQuestion: false,
  historyLength: 0,
  debug: {
    messageCount: 0,
    userMessageCount: 0,
    processedAt: new Date().toISOString(),
    hasOriginalQuestion: false,
    hasFailedAttempts: false,
    historyLength: 0,
    messageTypeBreakdown: {}
  }
});

export const formatMessagesForArchitect = (context: MessageContext): string => {
  const sections = [
    '=== ORIGINAL QUESTION ===',
    context.originalQuestion || 'No original question found',
    '',
    '=== CURRENT STATUS ===',
    `Total Messages: ${context.messageCount}`,
    `User Messages: ${context.userMessageCount}`,
    `Failed Attempts: ${context.hasFailedAttempts ? 'Yes' : 'No'}`,
    '',
    '=== CURRENT QUESTION ===',
    context.lastUserMessage?.content || context.originalQuestion || 'No question found',
    '',
    '=== SOLUTION STATUS ===',
    ...context.relevantHistory
      .filter(m => m.type === 'answer')
      .map(m => formatMessageContent(m)),
    '',
    '=== ANALYSIS ===',
    ...context.relevantHistory
      .filter(m => m.type === 'reasoning')
      .map(m => formatMessageContent(m)),
    '',
    '=== COMPLETE CONVERSATION HISTORY ===',
    ...context.relevantHistory.map(m => {
      const timestamp = new Date(context.processedAt).toISOString();
      const prefix = MESSAGE_PREFIXES[m.type] || '📝';
      const content = formatMessageContent(m);
      return `[${timestamp}] ${prefix}: ${content}`;
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