import { z } from "zod";
import { shouldEscalateToArchitect, getRetryDelay, sleep } from './escalation';
import { processMessageContext } from './messageContext';

const API_KEY_REGEX = /^[A-Za-z0-9_-]{10,}$/;

export const ApiKeySchema = z.object({
  deepseek: z.string().regex(API_KEY_REGEX, 'Invalid DeepSeek API key format'),
  elevenlabs: z.string().regex(/^[A-Za-z0-9]{32}$/, 'Invalid ElevenLabs API key format').optional(),
  gemini: z.string().regex(/^[A-Za-z0-9_-]{39}$/, 'Invalid Gemini API key format').optional(),
});

export interface ThoughtProcess {
  type: 'thinking' | 'planning' | 'analyzing' | 'solving';
  content: string;
  timestamp: number;
}

export interface ApiResponse {
  content: string;
  reasoning: string;
  thoughtProcess?: ThoughtProcess[];
  status: 'complete' | 'timeout' | 'error';
  timeoutReason?: string;
  shouldEscalateToArchitect?: boolean;
  escalationReason?: string;
}

export type MessageType = "user" | "reasoning" | "answer" | "system";

export interface Message {
  type: MessageType;
  content: string;
}

export interface MessageContext {
  originalQuestion: string;
  relevantHistory: Message[];
  hasFailedAttempts: boolean;
  lastUserMessage: Message | null;
  debug?: {
    messageCount: number;
    userMessageCount: number;
    processedAt: string;
  };
}

const STORAGE_KEY = "chat_history";
const API_KEYS_STORAGE = "api_keys";
const MAX_HISTORY = 5;
const API_URL = "https://api.deepseek.com/v1/chat/completions";

// Keep track of API key validation status
const apiKeyValidationCache = new Map<string, { isValid: boolean; timestamp: number }>();
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const TIMEOUT_DURATION = 120000; // 120 seconds
const ARCHITECT_TIMEOUT = 120000; // 120 seconds for architect review

const MAX_RETRIES = 2;
const RETRY_DELAY = 2000; // 2 seconds

interface AutoEscalationResult {
  shouldEscalate: boolean;
  reason: string;
}

const checkForAutoEscalation = (error: any, retryCount: number): AutoEscalationResult => {
  // Check for specific error conditions that warrant automatic escalation
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return {
      shouldEscalate: true,
      reason: "JSON parsing error in API response"
    };
  }

  if (error.message?.includes('Empty response')) {
    return {
      shouldEscalate: true,
      reason: "Empty or incomplete response from API"
    };
  }

  if (retryCount >= MAX_RETRIES) {
    return {
      shouldEscalate: true,
      reason: `Failed after ${MAX_RETRIES} attempts`
    };
  }

  return {
    shouldEscalate: false,
    reason: ""
  };
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const saveApiKeys = (keys: { [key: string]: string }) => {
  try {
    // Validate keys before saving
    ApiKeySchema.parse(keys);
    localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(keys));
    // Clear validation cache when new keys are saved
    apiKeyValidationCache.clear();
  } catch (error) {
    console.error("Invalid API key format:", error);
    throw new Error("Invalid API key format. Please check your API keys.");
  }
};

export const loadApiKeys = () => {
  try {
    const stored = localStorage.getItem(API_KEYS_STORAGE);
    if (!stored) return null;
    
    const keys = JSON.parse(stored);
    // Validate loaded keys
    ApiKeySchema.parse(keys);
    return keys;
  } catch (error) {
    console.error("Error loading API keys:", error);
    return null;
  }
};

export const validateApiKey = (apiKey: string | null): string => {
  if (!apiKey) {
    throw new Error('API key is required. Please set your DeepSeek API key in the settings.');
  }

  // Check cache first
  const cached = apiKeyValidationCache.get(apiKey);
  if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
    if (!cached.isValid) {
      throw new Error('Invalid API key. Please check your DeepSeek API key in settings.');
    }
    return apiKey;
  }

  // Basic format validation
  if (!API_KEY_REGEX.test(apiKey)) {
    apiKeyValidationCache.set(apiKey, { isValid: false, timestamp: Date.now() });
    throw new Error('Invalid API key format. Please check your DeepSeek API key.');
  }

  return apiKey;
};

export const handleApiError = (error: any): never => {
  let message = 'An unknown error occurred';
  
  if (error?.error?.message) {
    if (error.error.message.includes('Authentication Fails')) {
      message = 'Invalid or expired API key. Please check your DeepSeek API key in settings.';
      // Cache the invalid status
      const apiKey = error?.config?.headers?.Authorization?.replace('Bearer ', '');
      if (apiKey) {
        apiKeyValidationCache.set(apiKey, { isValid: false, timestamp: Date.now() });
      }
    } else if (error.error.type === 'authentication_error') {
      message = 'Authentication failed. Please verify your API key and try again.';
    } else {
      message = error.error.message;
    }
  }
  
  throw new Error(message);
};

export const saveToLocalStorage = (messages: Message[]) => {
  try {
    const trimmedHistory = messages.slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
};

export const loadFromLocalStorage = (): Message[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading from localStorage:", error);
    return [];
  }
};

const cleanJsonString = (str: string): string => {
  // Remove markdown code blocks
  str = str.replace(/```json\s*|\s*```/g, '');
  // Remove any other markdown formatting
  str = str.replace(/```[a-z]*\s*|\s*```/g, '');
  // Ensure proper JSON structure
  str = str.trim();
  // If the string doesn't start with {, wrap it
  if (!str.startsWith('{')) {
    str = `{"type": "thinking", "content": ${JSON.stringify(str)}}`;
  }
  return str;
};

// Add new interfaces for partial responses
interface PartialResponse {
  content: string;
  timestamp: number;
  isComplete: boolean;
}

// Update timeout configurations
const API_TIMEOUTS = {
  INITIAL_RESPONSE: 180000,    // 3 minutes
  RETRY_DELAY: 10000,         // 10 seconds
  MAX_RETRIES: 3,
  MAX_TOTAL_TIME: 300000      // 5 minutes
};

// Add partial response handling
let currentPartialResponse: PartialResponse | null = null;

const handleStreamResponse = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onUpdate: (content: string) => void
): Promise<string> => {
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        // Skip keep-alive messages
        if (line.trim() === ': keep-alive') continue;

        // Process data lines
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.message?.content;
            if (content) {
              fullContent += content;
              onUpdate(fullContent);
            }
          } catch (error) {
            console.warn('Error parsing stream data:', error);
          }
        }
      }
    }

    // Process any remaining content in buffer
    if (buffer.trim() && !buffer.includes(': keep-alive')) {
      try {
        const data = JSON.parse(buffer);
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          fullContent += content;
          onUpdate(fullContent);
        }
      } catch (error) {
        console.warn('Error parsing final buffer:', error);
      }
    }
  } catch (error) {
    console.error('Error processing stream:', error);
    throw error;
  }

  return fullContent;
};

export const callDeepSeek = async (
  message: string,
  apiKey: string,
  previousMessages: Message[] = [],
  onThoughtUpdate?: (thought: any) => void
): Promise<ApiResponse> => {
  let retryCount = 0;
  let lastError: Error | null = null;

  const updateThought = (content: string) => {
    const thought = {
      type: 'thinking',
      content,
      timestamp: Date.now()
    };
    onThoughtUpdate?.(thought);
    // Also add to previous messages to maintain context
    previousMessages.push({
      type: 'system',
      content: content
    });
  };

  while (retryCount <= API_TIMEOUTS.MAX_RETRIES) {
    try {
      // Create context with ALL messages including system messages
      const context = processMessageContext([
        ...previousMessages,
        { type: 'user', content: message }
      ]);
      
      // Enhanced debug logging
      console.debug('API Context:', {
        totalMessages: previousMessages.length,
        messageTypes: previousMessages.map(m => m.type),
        originalQuestion: context.originalQuestion,
        hasFailedAttempts: context.hasFailedAttempts,
        lastUserMessage: context.lastUserMessage?.content,
        fullContext: context
      });

      updateThought("Analyzing your question...");
      
      const thoughtResponse = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `You are in THINKING mode. Analyze the conversation and determine if architect assistance is needed.
                       The complete conversation history is provided below.
                       Format your response with these sections:
                       1. Original Question: [Extract and state the original question]
                       2. Current Status: [Describe where we are in solving it]
                       3. Issues Found: [List any problems or challenges]
                       4. Architect Needed?: [Yes/No and why]`
            },
            {
              role: "user",
              content: formatMessagesForArchitect(context)
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
          stream: false
        })
      });

      if (!thoughtResponse.ok) {
        throw new Error(`API Error: ${thoughtResponse.status} ${thoughtResponse.statusText}`);
      }

      const thoughtData = await thoughtResponse.json();
      const thoughtContent = thoughtData?.choices?.[0]?.message?.content;
      
      if (thoughtContent) {
        updateThought(thoughtContent);
        // Add thought to context
        previousMessages.push({
          type: 'reasoning',
          content: thoughtContent
        });
      }

      // Update context with new messages
      const updatedContext = processMessageContext([
        ...previousMessages,
        { type: 'user', content: message }
      ]);

      updateThought("Generating solution...");
      
      const solutionResponse = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `You are in SOLUTION mode. Review the complete conversation history below.
                       If you cannot solve the problem, explicitly state why and recommend architect escalation.
                       Format your response clearly with:
                       1. Understanding: [Show you understand the question]
                       2. Approach: [Explain your solution approach]
                       3. Solution: [Provide the solution or explain why escalation is needed]`
            },
            {
              role: "user",
              content: formatMessagesForArchitect(updatedContext)
            }
          ],
          temperature: 0.7,
          max_tokens: 4000,
          stream: false
        })
      });

      if (!solutionResponse.ok) {
        throw new Error(`API Error: ${solutionResponse.status} ${solutionResponse.statusText}`);
      }

      const solutionData = await solutionResponse.json();
      const solutionContent = solutionData?.choices?.[0]?.message?.content;

      if (!solutionContent) {
        throw new Error('Empty response from API');
      }

      // Add solution to context
      previousMessages.push({
        type: 'answer',
        content: solutionContent
      });

      return {
        status: 'complete',
        content: solutionContent,
        reasoning: thoughtContent || 'Analysis complete',
        thoughtProcess: [{
          type: 'thinking',
          content: thoughtContent || 'Processing complete',
          timestamp: Date.now()
        }]
      };

    } catch (error) {
      console.error(`API attempt ${retryCount + 1} failed:`, error);
      lastError = error;
      retryCount++;
      
      if (retryCount <= API_TIMEOUTS.MAX_RETRIES) {
        const retryMessage = `Retrying... Attempt ${retryCount + 1}/${API_TIMEOUTS.MAX_RETRIES}`;
        updateThought(retryMessage);
        await sleep(getRetryDelay(retryCount));
      } else {
        // On final retry, check for escalation
        const escalationCheck = shouldEscalateToArchitect(
          message,
          error.message,
          retryCount,
          previousMessages
        );

        if (escalationCheck.shouldEscalate) {
          return {
            status: 'complete',
            shouldEscalateToArchitect: true,
            escalationReason: escalationCheck.reason,
            content: '',
            reasoning: `Escalating to architect: ${escalationCheck.reason}`
          };
        }
      }
    }
  }

  throw lastError || new Error('Unknown error in API call');
};

// Add history storage functions
export const saveHistory = (messages: Message[]) => {
  try {
    const history = {
      messages,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    localStorage.setItem('chat_history', JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save chat history:', error);
  }
};

export const loadHistory = (): Message[] => {
  try {
    const savedHistory = localStorage.getItem('chat_history');
    if (savedHistory) {
      const history = JSON.parse(savedHistory);
      return history.messages || [];
    }
  } catch (error) {
    console.error('Failed to load chat history:', error);
  }
  return [];
};

function formatMessagesForArchitect(context: MessageContext): string {
  const sections = [
    '=== ORIGINAL QUESTION ===',
    context.originalQuestion || 'No original question found',
    '',
    '=== CURRENT QUESTION ===',
    context.lastUserMessage?.content || context.originalQuestion || 'No question found',
    '',
    '=== COMPLETE CONVERSATION HISTORY ===',
    ...context.relevantHistory.map(m => {
      let prefix;
      switch (m.type) {
        case 'user':
          prefix = '👤 User Question:';
          break;
        case 'answer':
          prefix = '🤖 Assistant Answer:';
          break;
        case 'reasoning':
          prefix = '💭 Assistant Reasoning:';
          break;
        case 'system':
          prefix = '⚙️ System:';
          break;
        default:
          prefix = (m.type as string).toUpperCase() + ':';
      }
      return `${prefix}\n${m.content.trim()}`;
    }),
    '',
    '=== CONVERSATION METADATA ===',
    `Total Messages: ${context.debug?.messageCount || 0}`,
    `User Messages: ${context.debug?.userMessageCount || 0}`,
    `Last Update: ${context.debug?.processedAt || 'unknown'}`
  ];

  return sections.join('\n\n');
}