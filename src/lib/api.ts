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
const MAX_HISTORY = 5;
const API_URL = "https://api.deepseek.com/chat/completions";

export const saveToLocalStorage = (messages: Message[]) => {
  try {
    const trimmedHistory = messages.slice(0, MAX_HISTORY);
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

export const callDeepSeek = async (prompt: string, apiKey: string): Promise<ApiResponse | null> => {
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
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      reasoning: "Analyzing the question and formulating a response based on available context and knowledge...",
    };
  } catch (error) {
    console.error("API call failed:", error);
    return null;
  }
};