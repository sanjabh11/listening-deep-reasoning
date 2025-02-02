import { z } from "zod";

export const ResponseSchema = z.object({
  content: z.string(),
  reasoning: z.string(),
});

export type ApiResponse = z.infer<typeof ResponseSchema>;

const STORAGE_KEY = "chat_history";
const MAX_HISTORY = 5;

export const saveToLocalStorage = (messages: any[]) => {
  try {
    const trimmedHistory = messages.slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
};

export const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading from localStorage:", error);
    return [];
  }
};

export const callDeepSeek = async (prompt: string): Promise<ApiResponse | null> => {
  try {
    // Simulated API call for now
    const response = {
      content: "This is a simulated response. In a real implementation, this would be streaming from the DeepSeek API.",
      reasoning: "Analyzing the question and breaking it down into components...\nConsidering relevant context and potential approaches...",
    };
    
    return response;
  } catch (error) {
    console.error("API call failed:", error);
    return null;
  }
};