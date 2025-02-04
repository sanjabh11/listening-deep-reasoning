import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { ArchitectReview } from "@/components/ArchitectReview";
import { callDeepSeek, saveToLocalStorage, loadFromLocalStorage, Message, saveApiKeys, loadApiKeys, loadHistory, saveHistory } from "@/lib/api";
import { callArchitectLLM } from "@/lib/architect";
import { AudioManager } from "@/lib/audio";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { ApiKeys, ArchitectReviewType } from "@/lib/types";

const AUDIO_ENABLED_KEY = 'audio_enabled';
const API_KEY_CHECK_INTERVAL = 30000; // 30 seconds

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOptions, setShowOptions] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => loadApiKeys());
  const [showApiKeyManager, setShowApiKeyManager] = useState(!loadApiKeys()?.deepseek);
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('audio_enabled') !== 'false');
  const [revisionCount, setRevisionCount] = useState(1);
  
  const { toast } = useToast();
  const audioManager = AudioManager.getInstance();

  // Load saved data on mount
  useEffect(() => {
    const savedMessages = loadHistory();
    const savedKeys = loadApiKeys();
    
    if (savedKeys) {
      setApiKeys({
        deepseek: savedKeys.deepseek || null,
        elevenlabs: savedKeys.elevenlabs || null,
        gemini: savedKeys.gemini || null
      });
    }
    
    if (savedMessages && savedMessages.length > 0) {
      setMessages(savedMessages);
    }
  }, []);

  // Save messages whenever they change
  useEffect(() => {
    if (messages.length > 1) { // Don't save if only system message
      saveHistory(messages);
    }
  }, [messages]);

  // Save audio preference
  useEffect(() => {
    localStorage.setItem(AUDIO_ENABLED_KEY, JSON.stringify(audioEnabled));
  }, [audioEnabled]);

  // Periodically validate API keys
  useEffect(() => {
    const validateKeys = () => {
      const savedKeys = loadApiKeys();
      if (savedKeys?.deepseek !== apiKeys.deepseek) {
        setApiKeys(prev => ({
          ...prev,
          deepseek: savedKeys?.deepseek || null
        }));
      }
    };

    const interval = setInterval(validateKeys, API_KEY_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [apiKeys.deepseek]);

  const handleApiKeysSubmit = (keys: { [key: string]: string }) => {
    setApiKeys({
      deepseek: keys.deepseek || null,
      elevenlabs: keys.elevenlabs || null,
      gemini: keys.gemini || null
    });
    saveApiKeys(keys);
    setShowApiKeyManager(false);
    
    // Show success toast
    toast({
      title: "Settings Saved",
      description: "Your API keys have been updated successfully.",
    });
  };

  const handleSend = async (message: string) => {
    setIsProcessing(true);
    setShowOptions(false);

    if (!apiKeys.deepseek) {
      toast({
        title: "API Key Required",
        description: "Please set your DeepSeek API key in settings before sending messages.",
        variant: "destructive"
      });
      setIsProcessing(false);
      return;
    }

    const newMessages: Message[] = [
      ...messages,
      { type: "user", content: message }
    ];
    setMessages(newMessages);

    // Add thinking indicator
    const thinkingMessage: Message = {
      type: "system",
      content: "🤔 Thinking..."
    };
    setMessages([...newMessages, thinkingMessage]);

    try {
      // Handle thought process updates
      const onThoughtUpdate = (thought: any) => {
        setMessages(prev => {
          // Find the last message
          const lastMsg = prev[prev.length - 1];
          
          // If it's a thinking indicator or another thought, replace it
          if (lastMsg.type === "system" && 
              (lastMsg.content.includes("🤔") || 
               lastMsg.content.includes("💭") || 
               lastMsg.content.includes("📝") || 
               lastMsg.content.includes("🔍") || 
               lastMsg.content.includes("⚡"))) {
            return [
              ...prev.slice(0, -1),
              { 
                type: "system", 
                content: `${getThoughtEmoji(thought.type)} ${thought.content}`
              }
            ];
          }
          
          // Otherwise, add as a new message
          return [
            ...prev,
            { 
              type: "system", 
              content: `${getThoughtEmoji(thought.type)} ${thought.content}`
            }
          ];
        });
      };

      const response = await callDeepSeek(
        message, 
        apiKeys.deepseek,
        messages.slice(-4), // Keep last 4 messages for context
        onThoughtUpdate
      );

      // Handle automatic escalation
      if (response.shouldEscalateToArchitect) {
        const escalationMessages: Message[] = [
          ...newMessages,
          { 
            type: "system", 
            content: `⚠️ ${response.escalationReason || "An error occurred. Requesting architect solution..."}`
          }
        ];
        setMessages(escalationMessages);
        
        // Automatically trigger architect in solve mode
        if (apiKeys.gemini) {
          await handleArchitectEscalation(message, 'solve');
        } else {
          toast({
            title: "Architect Solution Required",
            description: "The AI encountered issues. Please set up Gemini API key to get architect solution.",
            action: (
              <ToastAction altText="Open Settings" onClick={() => setShowApiKeyManager(true)}>
                Open Settings
              </ToastAction>
            )
          });
        }
        return;
      }

      if (response.status === 'timeout') {
        // Handle timeout with architect escalation option
        const timeoutMessages: Message[] = [
          ...newMessages,
          { 
            type: "system", 
            content: "⏱️ " + response.timeoutReason || "Request timed out. Would you like to escalate to an architect review?"
          }
        ];
        setMessages(timeoutMessages);
        
        // Show escalation option
        toast({
          title: "Request Timed Out",
          description: "The request is taking longer than expected. Would you like an architect to review?",
          action: (
            <ToastAction altText="Escalate" onClick={() => handleArchitectEscalation(message)}>
              Escalate to Architect
            </ToastAction>
          ),
          duration: 10000 // Show for 10 seconds
        });
      } else if (response.status === 'complete') {
        // Remove the thinking indicator
        const updatedMessages = messages.filter(m => 
          !(m.type === "system" && m.content.includes("🤔"))
        );

        // Add thought process if available
        const finalMessages = [...updatedMessages];
        if (response.thoughtProcess?.length) {
          response.thoughtProcess.forEach(thought => {
            finalMessages.push({
              type: "system",
              content: `${getThoughtEmoji(thought.type)} ${thought.content}`
            });
          });
        }

        // Add final response
        finalMessages.push(
          { type: "reasoning", content: response.reasoning },
          { type: "answer", content: response.content }
        );

        setMessages(finalMessages);
        saveHistory(finalMessages);

        if (audioEnabled && apiKeys.elevenlabs) {
          try {
            await audioManager.generateAndPlaySpeech(response.content, apiKeys.elevenlabs);
          } catch (audioError) {
            console.error("Audio generation failed:", audioError);
            toast({
              title: "Audio Error",
              description: "Failed to generate audio. Text response is still available.",
              variant: "destructive"
            });
          }
        }
      }
    } catch (error) {
      console.error("API call failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get a response';
      
      // Check if it's an API key related error
      const isApiKeyError = errorMessage.toLowerCase().includes('api key') || 
                           errorMessage.toLowerCase().includes('authentication');
      
      toast({
        title: isApiKeyError ? "API Key Error" : "Error",
        description: errorMessage,
        variant: "destructive",
        action: isApiKeyError ? (
          <ToastAction altText="Open Settings" onClick={() => setShowApiKeyManager(true)}>
            Open Settings
          </ToastAction>
        ) : undefined
      });
      
      // Add error message to chat
      const errorMessages: Message[] = [
        ...newMessages,
        { 
          type: "answer", 
          content: isApiKeyError ? 
            "I encountered an authentication error. Please check your API key in settings." :
            "I apologize, but I encountered an error while processing your request. Please try again."
        }
      ];
      setMessages(errorMessages);
      saveHistory(errorMessages);
    } finally {
      setIsProcessing(false);
      setShowOptions(true);
    }
  };

  const handleArchitectEscalation = async (originalMessage: string, mode: 'review' | 'solve' = 'review') => {
    if (!apiKeys.gemini) {
      toast({
        title: "Architect Review Unavailable",
        description: "Please set up your Gemini API key in settings to use the architect review feature.",
        action: (
          <ToastAction altText="Open Settings" onClick={() => setShowApiKeyManager(true)}>
            Open Settings
          </ToastAction>
        )
      });
      return;
    }

    setIsProcessing(true);
    setMessages(prev => [...prev, { 
      type: "system", 
      content: mode === 'review' ? "👨‍💻 Escalating to architect review..." : "👨‍💻 Requesting architect solution..." 
    }]);

    try {
      const review = await callArchitectLLM(messages, apiKeys.gemini, mode);
      if (review) {
        // Remove the escalation message
        const updatedMessages = messages.filter(m => 
          !m.content.includes("Escalating to architect") && 
          !m.content.includes("Requesting architect")
        );

        if (mode === 'solve') {
          // For solve mode, focus on the solution
          if (review.solution) {
            setMessages([
              ...updatedMessages,
              { 
                type: "system", 
                content: "🏗️ Architect Solution:" 
              },
              {
                type: "answer",
                content: review.solution
              }
            ]);
          } else {
            // If no solution provided, show the review
            setMessages([
              ...updatedMessages,
              { 
                type: "system", 
                content: "⚠️ Architect could not provide a solution:" 
              },
              {
                type: "answer",
                content: JSON.stringify(review, null, 2)
              }
            ]);
          }
        } else {
          // For review mode, show the full review
          setMessages([
            ...updatedMessages,
            { 
              type: "system", 
              content: "🏗️ Architect Review:" 
            },
            {
              type: "answer",
              content: JSON.stringify(review, null, 2)
            }
          ]);
        }
      }
    } catch (error) {
      console.error("Architect review failed:", error);
      toast({
        title: mode === 'review' ? "Architect Review Failed" : "Architect Solution Failed",
        description: "Unable to get architect response at this time. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptionSelect = async (choice: number) => {
    if (choice === 4) {
      setMessages([messages[0]]);
      saveHistory([]);
      setShowOptions(false);
    } else if (choice === 5) {
      if (!apiKeys.gemini) {
        toast({
          title: "Error",
          description: "Please enter your Gemini API key to use the architect review feature",
          variant: "destructive",
        });
        return;
      }

      setIsProcessing(true);
      setShowOptions(false);

      try {
        const review = await callArchitectLLM(messages, apiKeys.gemini);
        if (review) {
          const updatedMessages: Message[] = [
            ...messages,
            { type: "system", content: "🔍 Architect Review Requested" },
            { type: "reasoning", content: "Analyzing solution quality, architecture, and potential improvements..." },
            { type: "answer", content: JSON.stringify(review, null, 2) }
          ];
          setMessages(updatedMessages);
          saveHistory(updatedMessages.slice(1));
        }
      } catch (error) {
        console.error("Architect review error:", error);
        toast({
          title: "Error",
          description: "An error occurred during the architect review. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
        setShowOptions(true);
      }
    } else {
      const prompts = {
        1: "Could you provide more details about that?",
        2: "Please explain your reasoning in more detail.",
        3: "Can you show some examples to illustrate this?",
      };
      handleSend(prompts[choice as 1 | 2 | 3]);
    }
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    if (!audioEnabled) {
      audioManager.stop();
    }
  };

  const getThoughtEmoji = (type: string): string => {
    switch (type) {
      case 'thinking': return '💭';
      case 'planning': return '📝';
      case 'analyzing': return '🔍';
      case 'solving': return '⚡';
      default: return '💡';
    }
  };

  const handleRevisionRequest = async (improvements: string[]) => {
    setIsProcessing(true);
    setShowOptions(false);
    
    try {
      // Get the original query and last solution
      const originalQuery = messages.find(m => m.type === 'user')?.content || '';
      const lastSolution = messages.find(m => m.type === 'answer' && !m.content.includes('"criticalIssues"'))?.content || '';
      const improvementsList = improvements.join('\n');
      
      // Create a new message that includes the improvements and context
      const revisionMessage = `
Original Query: ${originalQuery}

Previous Solution:
${lastSolution}

Requested Improvements:
${improvementsList}

Please provide a complete revised solution addressing all the improvements listed above. 
Ensure the solution is clear, complete, and addresses each improvement point.`;

      // Add revision request to messages
      const revisionRequestMessage: Message = {
        type: "system",
        content: "🔄 Sending revision request..."
      };
      setMessages(prev => [...prev, revisionRequestMessage]);

      // Send the revision request
      const response = await callDeepSeek(revisionMessage, apiKeys.deepseek, messages);

      if (response.status === 'complete') {
        const updatedMessages: Message[] = [
          ...messages.filter(m => m.content !== "🔄 Sending revision request..."),
          { type: "system", content: "📝 Revision Attempt #" + revisionCount },
          { type: "reasoning", content: response.reasoning },
          { type: "answer", content: response.content }
        ];

        setMessages(updatedMessages);
        saveHistory(updatedMessages);
        setRevisionCount(prev => prev + 1);

        // Show success toast
        toast({
          title: "Revision Complete",
          description: "The solution has been revised based on the improvements.",
        });
      } else if (response.status === 'timeout') {
        toast({
          title: "Revision Timeout",
          description: "The revision request timed out. Would you like to try again or escalate to architect review?",
          action: (
            <ToastAction altText="Escalate" onClick={() => handleArchitectEscalation(revisionMessage)}>
              Escalate to Architect
            </ToastAction>
          ),
          duration: 10000
        });
      }
    } catch (error) {
      console.error("Revision request failed:", error);
      const currentQuery = messages.find(m => m.type === 'user')?.content || '';
      toast({
        title: "Error",
        description: "Failed to process revision request. Please try again or escalate to architect review.",
        variant: "destructive",
        action: (
          <ToastAction altText="Escalate" onClick={() => handleArchitectEscalation(currentQuery)}>
            Escalate to Architect
          </ToastAction>
        )
      });
    } finally {
      setIsProcessing(false);
      setShowOptions(true);
    }
  };

  // Update the message rendering to include revision handling
  const renderMessage = (message: Message, index: number) => {
    if (message.type === "answer" && message.content.includes('"criticalIssues"')) {
      try {
        const review = JSON.parse(message.content) as ArchitectReviewType;
        return (
          <ArchitectReview
            key={index}
            review={review}
            onRevisionRequest={() => handleRevisionRequest(review.improvements)}
            isProcessing={isProcessing}
            revisionNumber={revisionCount}
          />
        );
      } catch (error) {
        console.error("Failed to parse review:", error);
        return <ChatMessage key={index} type={message.type} content={message.content} />;
      }
    }
    return <ChatMessage key={index} type={message.type} content={message.content} />;
  };

  if (!apiKeys.deepseek) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ApiKeyManager 
          onSubmit={handleApiKeysSubmit}
          initialKeys={apiKeys}
          show={showApiKeyManager}
          setShow={setShowApiKeyManager}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-4xl mx-auto p-4">
      <div className="flex justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setApiKeys({ deepseek: null, elevenlabs: null, gemini: null })}
        >
          Change API Keys
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAudio}
          className="flex items-center gap-2"
        >
          {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {audioEnabled ? 'Mute' : 'Unmute'}
        </Button>
      </div>

      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.map((message, index) => renderMessage(message, index))}
        {isProcessing && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2">Processing...</span>
          </div>
        )}
      </div>
      
      {showOptions && <InteractionOptions onSelect={handleOptionSelect} />}
      
      <div className="sticky bottom-0 bg-background pt-4">
        <ChatInput onSend={handleSend} disabled={isProcessing} />
      </div>
      {showApiKeyManager && (
        <ApiKeyManager 
          onSubmit={handleApiKeysSubmit}
          initialKeys={apiKeys}
          show={showApiKeyManager}
          setShow={setShowApiKeyManager}
        />
      )}
    </div>
  );
};

export default Index;