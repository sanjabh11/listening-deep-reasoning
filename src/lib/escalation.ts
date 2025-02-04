import { Message } from "./api";

// Timeout configurations
export const TIMEOUTS = {
  INITIAL_RESPONSE: 30000,    // 30 seconds
  RETRY_DELAY: 5000,         // 5 seconds
  MAX_RETRIES: 3,
  MAX_TOTAL_TIME: 120000     // 2 minutes
};

// Patterns that indicate complex questions requiring architect
const COMPLEX_PATTERNS = [
  /\b(implement|create|build|design)\b.*\b(system|architecture|framework)\b/i,
  /\b(optimize|improve|enhance)\b.*\b(performance|efficiency|scalability)\b/i,
  /\b(debug|fix|solve)\b.*\b(complex|difficult|challenging)\b/i,
  /\b(3D|three\.js|webgl|canvas)\b/i,
  /\b(algorithm|data structure)\b.*\b(implementation|design)\b/i,
  /\b(security|authentication|authorization)\b/i,
  /\b(distributed|concurrent|parallel)\b/i,
];

interface EscalationResult {
  shouldEscalate: boolean;
  reason?: string;
  retryCount: number;
}

export const shouldEscalateToArchitect = (
  message: string,
  errorType?: string,
  retryCount: number = 0,
  previousResponses: Message[] = []
): EscalationResult => {
  // Check for complex patterns
  const isComplexQuestion = COMPLEX_PATTERNS.some(pattern => pattern.test(message));
  if (isComplexQuestion) {
    return {
      shouldEscalate: true,
      reason: "Question complexity requires architect expertise",
      retryCount
    };
  }

  // Check for multiple failed attempts
  const failedAttempts = previousResponses.filter(m => 
    m.type === "answer" && 
    (m.content.includes("error") || m.content.includes("failed") || m.content.includes("unable"))
  ).length;

  if (failedAttempts >= 2) {
    return {
      shouldEscalate: true,
      reason: "Multiple failed attempts to answer the question",
      retryCount
    };
  }

  // Handle API errors
  if (errorType) {
    // If we haven't reached max retries, suggest retry
    if (retryCount < TIMEOUTS.MAX_RETRIES) {
      return {
        shouldEscalate: false,
        reason: "Attempting retry with DeepSeek API",
        retryCount: retryCount + 1
      };
    }

    // If max retries reached, escalate
    return {
      shouldEscalate: true,
      reason: `DeepSeek API failed after ${retryCount} retries: ${errorType}`,
      retryCount
    };
  }

  return {
    shouldEscalate: false,
    retryCount
  };
};

export const getRetryDelay = (retryCount: number): number => {
  // Exponential backoff with jitter
  const baseDelay = TIMEOUTS.RETRY_DELAY;
  const maxJitter = 1000; // 1 second
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * maxJitter;
  return Math.min(exponentialDelay + jitter, TIMEOUTS.MAX_TOTAL_TIME);
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)); 