import { Message } from "./api";

export interface ArchitectReview {
  criticalIssues: string[];
  potentialProblems: string[];
  improvements: string[];
  verdict: "APPROVED" | "NEEDS_REVISION";
}

export const callArchitectLLM = async (
  messages: Message[],
  apiKey: string
): Promise<ArchitectReview | null> => {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Changed: Remove 'Bearer' prefix for Gemini API
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a CRITICAL CODE REVIEWER. Review this conversation and solution:
            
${messages.map(m => `${m.type.toUpperCase()}: ${m.content}`).join('\n\n')}

FORMAT YOUR RESPONSE AS JSON with these sections:
{
  "criticalIssues": ["list of critical issues with code examples"],
  "potentialProblems": ["list of potential problems"],
  "improvements": ["list of suggested improvements with code examples"],
  "verdict": "APPROVED" or "NEEDS_REVISION"
}`
          }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Architect LLM API call failed: ${response.statusText}`);
    }

    const data = await response.json();
    const reviewText = data.candidates[0].content.parts[0].text;
    return JSON.parse(reviewText);
  } catch (error) {
    console.error("Error calling Architect LLM:", error);
    return null;
  }
};