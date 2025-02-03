import { z } from "zod";

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

export const saveApiKeys = (keys: { [key: string]: string }) => {
  localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(keys));
};

export const loadApiKeys = () => {
  try {
    const stored = localStorage.getItem(API_KEYS_STORAGE);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error("Error loading API keys:", error);
    return null;
  }
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

export const callDeepSeek = async (prompt: string, apiKey: string): Promise<ApiResponse> => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from API');
    }

    return {
      content: data.choices[0].message.content,
      reasoning: "Analyzing the question and formulating a response based on available context and knowledge..."
    };
  } catch (error) {
    console.error("API call failed:", error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get response from API');
  }
};