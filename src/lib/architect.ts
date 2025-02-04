import { Message } from "./api";
import { processMessageContext, formatMessagesForArchitect } from "./messageContext";

export interface ArchitectReview {
  criticalIssues: string[];
  potentialProblems: string[];
  improvements: string[];
  verdict: "APPROVED" | "NEEDS_REVISION";
  solution?: string;
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

// Rename to avoid conflict with imported function
const validateArchitectMessageChain = (messages: Message[], allowPartial: boolean = true): boolean => {
  if (!Array.isArray(messages)) {
    console.warn('Invalid message chain format');
    return false;
  }

  if (messages.length === 0) {
    console.warn('Empty message chain');
    return allowPartial;
  }

  const userMessages = messages.filter(m => m.type === 'user');
  if (userMessages.length === 0) {
    console.warn('No user messages found in chain');
    return allowPartial;
  }

  const validMessages = messages.filter(m => 
    m && typeof m === 'object' && 
    'type' in m && 
    'content' in m && 
    typeof m.content === 'string'
  );

  if (validMessages.length !== messages.length) {
    console.warn('Some messages in chain are invalid');
    return allowPartial;
  }

  return true;
};

export const callArchitectLLM = async (
  messages: Message[],
  apiKey: string,
  mode: 'review' | 'solve' = 'review'
): Promise<ArchitectReview | null> => {
  try {
    // Validate message chain with relaxed validation for partial responses
    if (!validateArchitectMessageChain(messages, true)) {
      const lastUserMessage = messages.find(m => m.type === 'user')?.content;
      const partialContent = messages
        .filter(m => m.type === 'answer' || m.type === 'reasoning')
        .map(m => m.content)
        .join('\n');

      if (lastUserMessage || partialContent) {
        return {
          criticalIssues: ["Incomplete message chain"],
          potentialProblems: ["Some context may be missing"],
          improvements: ["Will attempt to work with available content"],
          verdict: "NEEDS_REVISION",
          solution: partialContent || lastUserMessage
        };
      }

      return {
        criticalIssues: ["Invalid or corrupted message chain"],
        potentialProblems: ["Message history may be incomplete"],
        improvements: ["Please try your question again"],
        verdict: "NEEDS_REVISION"
      };
    }

    // Process message context with improved handling
    const context = processMessageContext(messages);
    
    // More lenient validation for questions
    const question = context.lastUserMessage?.content || context.originalQuestion;
    if (!question) {
      console.error('No question found in context:', context.debug);
      return {
        criticalIssues: ["No clear question found"],
        potentialProblems: ["Previous context may be available"],
        improvements: ["Please provide your question"],
        verdict: "NEEDS_REVISION",
        solution: context.relevantHistory
          .filter(m => m.type === 'answer')
          .map(m => m.content)
          .join('\n')
      };
    }

    // Format messages with improved context
    const formattedContext = formatMessagesForArchitect(context);

    // Enhanced solve prompt with better partial response handling
    const solvePrompt = `You are an EXPERT PROBLEM SOLVER. Your task is to solve this specific question:

${formattedContext}

SOLUTION REQUIREMENTS:
1. You MUST provide a solution to the question above
2. If the question or context is incomplete, work with what's available
3. Show your work and reasoning where possible
4. If providing code:
   - Include necessary dependencies
   - Add error handling if possible
   - Make the code as complete as possible given the context
5. If you can't provide a complete solution, provide the best partial solution possible

YOUR RESPONSE MUST BE A VALID JSON OBJECT with these exact fields:
{
  "criticalIssues": [],
  "potentialProblems": [],
  "improvements": [],
  "verdict": "APPROVED",
  "solution": "YOUR SOLUTION HERE"
}

IMPORTANT RULES:
1. Always provide a solution, even if partial
2. If the context is incomplete, work with what you have
3. Do not use markdown formatting in the solution
4. If clarification is needed, include it in criticalIssues but still attempt a solution
5. Mark partial or incomplete solutions in potentialProblems`;

    // Different prompts based on mode
    const reviewPrompt = `You are a CRITICAL CODE REVIEWER analyzing this conversation:

${formattedContext}

REVIEW INSTRUCTIONS:
1. Analyze the conversation flow, solution quality, and technical accuracy
2. Identify any issues with code examples, mathematical explanations, or technical concepts
3. Check for missing dependencies, error handling, and best practices
4. Suggest specific improvements with examples
5. If there are no critical issues, explain why the solution is good`;

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
      
      // Additional validation for solve mode with partial response handling
      if (mode === 'solve') {
        if (!parsedReview.solution) {
          // Try to extract any partial solution from the context
          const partialSolution = context.relevantHistory
            .filter(m => m.type === 'answer')
            .map(m => m.content)
            .join('\n');

          parsedReview.solution = partialSolution || "Partial solution not available";
          parsedReview.potentialProblems = [
            ...(parsedReview.potentialProblems || []),
            "Solution may be incomplete"
          ];
        }

        if (parsedReview.solution.includes("no question provided")) {
          console.error('Architect failed to process question:', {
            originalQuestion: context.originalQuestion,
            lastUserMessage: context.lastUserMessage?.content,
            debug: context.debug
          });
          
          return {
            criticalIssues: [
              "Failed to process the question properly",
              `Question was: ${question}`
            ],
            potentialProblems: ["Architect may need more context"],
            improvements: ["Please try rephrasing your question"],
            verdict: "NEEDS_REVISION",
            solution: parsedReview.solution
          };
        }
      }
      
      // Extract code content for validation
      const codeContent = messages
        .filter(m => m.type === 'answer')
        .map(m => m.content)
        .join('\n');
      
      return validateReviewFormat(parsedReview, codeContent);
    } catch (parseError) {
      console.error('Failed to parse architect response:', parseError);
      
      // Try to salvage any partial content
      const partialContent = context.relevantHistory
        .filter(m => m.type === 'answer')
        .map(m => m.content)
        .join('\n');

      return {
        criticalIssues: ["Failed to parse architect response", parseError.message],
        potentialProblems: ["Response format may be invalid"],
        improvements: ["Please try the request again"],
        verdict: "NEEDS_REVISION",
        solution: partialContent || null
      };
    }
  } catch (error) {
    console.error("Error calling Architect LLM:", error);
    return {
      criticalIssues: ["Error calling architect service", error.message],
      potentialProblems: ["Service may be temporarily unavailable"],
      improvements: ["Please try again later"],
      verdict: "NEEDS_REVISION",
      solution: null
    };
  }
};