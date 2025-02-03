import { z } from "zod";

const API_KEY_REGEX = /^[A-Za-z0-9_-]{10,}$/;

export const ApiKeySchema = z.object({
  deepseek: z.string().regex(API_KEY_REGEX, 'Invalid DeepSeek API key format'),
  elevenlabs: z.string().regex(/^[A-Za-z0-9]{32}$/, 'Invalid ElevenLabs API key format').optional(),
  gemini: z.string().regex(/^[A-Za-z0-9_-]{39}$/, 'Invalid Gemini API key format').optional(),
});

export const ResponseSchema = z.object({
  content: z.string(),
  reasoning: z.string(),
});

export type ApiResponse = z.infer<typeof ResponseSchema>;
export type MessageType = "user" | "reasoning" | "answer" | "system";

export interface Message {
  type: MessageType;
  content: string;
}

const STORAGE_KEY = "chat_history";
const API_KEYS_STORAGE = "api_keys";
const MAX_HISTORY = 5;
const API_URL = "https://api.deepseek.com/v1/chat/completions";

// Keep track of API key validation status
const apiKeyValidationCache = new Map<string, { isValid: boolean; timestamp: number }>();
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

export const callDeepSeek = async (prompt: string, apiKey: string, previousMessages: Message[] = []): Promise<ApiResponse> => {
  try {
    // Validate API key before making the request
    const validatedKey = validateApiKey(apiKey);

    // Build conversation history with proper formatting
    const conversationHistory = previousMessages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.content.replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines
    }));

    // Add retry logic
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validatedKey}`
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { 
                role: "system", 
                content: `You are a helpful AI assistant focused on providing detailed, contextual responses. Important rules:
1. Always maintain conversation context from previous messages
2. When asked for more details or examples, refer specifically to the topic from previous messages
3. Never ask for clarification when the context is clear from conversation history
4. Provide complete, self-contained responses
5. If you encounter an error or cannot proceed, explain why specifically
6. Format mathematical expressions properly using LaTeX notation
7. When providing code examples, ensure they are complete and runnable`
              },
              ...conversationHistory,
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            presence_penalty: 0.6,
            frequency_penalty: 0.6,
            stop: null
          })
        });

        // Handle non-OK responses
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: { message: errorText } };
          }
          
          console.error(`API error (attempt ${attempt}/${maxRetries}):`, errorData);
          
          // Handle authentication errors immediately without retrying
          if (response.status === 401) {
            handleApiError(errorData);
          }
          
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        // Read response as text first
        const responseText = await response.text();
        if (!responseText.trim()) {
          throw new Error('Empty response from API');
        }

        // Try to parse the response
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse response:', parseError);
          console.error('Raw response:', responseText);
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }

        // Validate response structure
        if (!data?.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format: missing content');
        }

        return {
          content: data.choices[0].message.content,
          reasoning: "Analyzing the conversation context and providing a relevant response..."
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry authentication errors
        if (error instanceof Error && 
            (error.message.includes('Authentication') || 
             error.message.includes('API key'))) {
          throw error;
        }
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError || new Error('Unknown error occurred');
  } catch (error) {
    console.error("API call failed:", error);
    throw error instanceof Error ? error : new Error('Failed to get response from API');
  }
};