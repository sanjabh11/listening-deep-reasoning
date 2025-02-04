export interface ApiKeys {
  deepseek: string | null;
  elevenlabs: string | null;
  gemini: string | null;
}

export interface Message {
  type: "user" | "reasoning" | "answer" | "system";
  content: string;
}

export interface ArchitectReviewType {
  criticalIssues: string[];
  potentialProblems: string[];
  improvements: string[];
  verdict: "APPROVED" | "NEEDS_REVISION";
  content?: string;
} 