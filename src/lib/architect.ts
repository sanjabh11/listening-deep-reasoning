import { Message } from "./api";

export interface ArchitectReview {
  criticalIssues: string[];
  potentialProblems: string[];
  improvements: string[];
  verdict: "APPROVED" | "NEEDS_REVISION";
  solution?: string; // Added for when architect provides a solution
}

const validateCode = (content: string): { issues: string[], problems: string[] } => {
  const issues: string[] = [];
  const problems: string[] = [];

  // Check for common script dependencies
  const dependencyChecks = [
    {
      lib: 'THREE',
      cdnCheck: 'three.min.js',
      error: 'Three.js dependency is required but not properly loaded'
    },
    {
      lib: 'p5',
      cdnCheck: 'p5.js',
      error: 'p5.js dependency is required but not properly loaded'
    },
    // Add more library checks as needed
  ];

  // Check HTML structure
  if (!content.includes('<!DOCTYPE html>')) {
    problems.push('Missing DOCTYPE declaration');
  }

  // Check for script dependencies
  dependencyChecks.forEach(({ lib, cdnCheck, error }) => {
    if (content.includes(lib) && !content.includes(cdnCheck)) {
      issues.push(error);
    }
  });

  // Check for common errors
  if (content.includes('ReferenceError')) {
    issues.push('Code contains reference errors that need to be fixed');
  }

  // Check for proper script loading
  if (content.includes('<script>') && !content.includes('defer') && !content.includes('async')) {
    problems.push('Scripts should use defer or async for better performance');
  }

  // Check for error handling
  if (!content.includes('try') && !content.includes('catch')) {
    problems.push('No error handling found in the code');
  }

  return { issues, problems };
};

const cleanJsonResponse = (text: string): string => {
  // Remove markdown formatting
  text = text.replace(/```json\s*|\s*```/g, '');
  text = text.replace(/```html\s*|\s*```/g, '');
  
  // Ensure the response is proper JSON
  text = text.trim();
  
  // If it's not a JSON object, wrap it
  if (!text.startsWith('{')) {
    return `{
      "criticalIssues": ["Error parsing response: ${text}"],
      "potentialProblems": ["Unable to parse the review response"],
      "improvements": ["Please try the review again"],
      "verdict": "NEEDS_REVISION"
    }`;
  }
  
  return text;
};

const validateReviewFormat = (review: any, codeContent: string): ArchitectReview => {
  const defaultReview: ArchitectReview = {
    criticalIssues: ["Failed to validate review format"],
    potentialProblems: ["Review response was not in the expected format"],
    improvements: ["Please try the review again"],
    verdict: "NEEDS_REVISION"
  };

  if (!review) return defaultReview;

  try {
    // Validate code if present
    if (codeContent) {
      const { issues, problems } = validateCode(codeContent);
      if (issues.length > 0) {
        review.criticalIssues = [...(review.criticalIssues || []), ...issues];
        review.verdict = "NEEDS_REVISION";
      }
      if (problems.length > 0) {
        review.potentialProblems = [...(review.potentialProblems || []), ...problems];
      }
    }

    // Ensure all required arrays exist
    review.criticalIssues = Array.isArray(review.criticalIssues) ? review.criticalIssues : [review.criticalIssues || "No critical issues specified"];
    review.potentialProblems = Array.isArray(review.potentialProblems) ? review.potentialProblems : [review.potentialProblems || "No potential problems specified"];
    review.improvements = Array.isArray(review.improvements) ? review.improvements : [review.improvements || "No improvements specified"];
    
    // Add standard improvements if none exist
    if (review.improvements.length === 0) {
      review.improvements = [
        "Add proper error handling",
        "Include loading states and fallbacks",
        "Consider adding user feedback mechanisms"
      ];
    }

    // Ensure verdict is valid and consistent with issues
    if (review.criticalIssues.length > 0) {
      review.verdict = "NEEDS_REVISION";
    } else {
      review.verdict = ["APPROVED", "NEEDS_REVISION"].includes(review.verdict) ? review.verdict : "NEEDS_REVISION";
    }

    return review as ArchitectReview;
  } catch (error) {
    console.error("Failed to validate review format:", error);
    return defaultReview;
  }
};

export const callArchitectLLM = async (
  messages: Message[],
  apiKey: string,
  mode: 'review' | 'solve' = 'review'
): Promise<ArchitectReview | null> => {
  try {
    // Extract the original question from user messages
    const originalQuestion = messages.find(m => m.type === 'user')?.content || '';
    
    // Format messages for better context
    const formattedMessages = messages.map(m => {
      let prefix = '';
      switch (m.type) {
        case 'user': prefix = '👤 User:'; break;
        case 'answer': prefix = '🤖 Assistant:'; break;
        case 'reasoning': prefix = '💭 Reasoning:'; break;
        default: prefix = m.type.toUpperCase() + ':';
      }
      return `${prefix} ${m.content.trim()}`;
    }).join('\n\n');

    // Extract code content for validation
    const codeContent = messages
      .filter(m => m.type === 'answer')
      .map(m => m.content)
      .join('\n');

    // Different prompts based on mode
    const reviewPrompt = `You are a CRITICAL CODE REVIEWER analyzing a conversation and solution. Your task:

CONTEXT:
${formattedMessages}

REVIEW INSTRUCTIONS:
1. Analyze the conversation flow, solution quality, and technical accuracy
2. Identify any issues with code examples, mathematical explanations, or technical concepts
3. Check for missing dependencies, error handling, and best practices
4. Suggest specific improvements with examples
5. If there are no critical issues, explain why the solution is good`;

    const solvePrompt = `You are an EXPERT PROBLEM SOLVER tasked with solving this problem from scratch:

ORIGINAL QUESTION:
${originalQuestion}

PREVIOUS ATTEMPT CONTEXT:
${formattedMessages}

SOLUTION INSTRUCTIONS:
1. Solve the original question completely and accurately
2. Show all your work and calculations
3. Provide clear explanations for each step
4. Include any necessary formulas, code, or mathematical explanations
5. Double-check your calculations and logic
6. If it's a coding problem, include complete working code with all necessary dependencies`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${mode === 'review' ? reviewPrompt : solvePrompt}

YOUR RESPONSE MUST BE A VALID JSON OBJECT with these exact fields:
{
  "criticalIssues": ["list", "of", "critical", "issues"],
  "potentialProblems": ["list", "of", "potential", "problems"],
  "improvements": ["list", "of", "improvements"],
  "verdict": "NEEDS_REVISION" or "APPROVED",
  "solution": ${mode === 'solve' ? '"YOUR COMPLETE AND DETAILED SOLUTION HERE"' : 'null'}
}

Note: If in solve mode, you MUST provide a complete solution to the original question.
The solution should be detailed, accurate, and self-contained.
Do not include any markdown formatting or code blocks in your response.
The verdict should be "NEEDS_REVISION" if ANY critical issues exist.`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Architect LLM API call failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response format from Gemini API');
    }

    const reviewText = data.candidates[0].content.parts[0].text.trim();
    console.log('Raw review text:', reviewText);
    
    try {
      const cleanedText = cleanJsonResponse(reviewText);
      const parsedReview = JSON.parse(cleanedText);
      return validateReviewFormat(parsedReview, codeContent);
    } catch (parseError) {
      console.error('Failed to parse review:', parseError);
      return validateReviewFormat(null, codeContent);
    }
  } catch (error) {
    console.error("Error calling Architect LLM:", error);
    return validateReviewFormat(null, '');
  }
};