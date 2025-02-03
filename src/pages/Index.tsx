import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { ArchitectReview } from "@/components/ArchitectReview";
import { callDeepSeek, saveToLocalStorage, loadFromLocalStorage, Message, saveApiKeys, loadApiKeys } from "@/lib/api";
import { callArchitectLLM } from "@/lib/architect";
import { AudioManager } from "@/lib/audio";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { Loader2, Volume2, VolumeX } from "lucide-react";

const AUDIO_ENABLED_KEY = 'audio_enabled';
const API_KEY_CHECK_INTERVAL = 30000; // 30 seconds

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKeys, setApiKeys] = useState<{
    deepseek: string | null;
    elevenlabs: string | null;
    gemini: string | null;
  }>({
    deepseek: null,
    elevenlabs: null,
    gemini: null
  });
  
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const saved = localStorage.getItem(AUDIO_ENABLED_KEY);
    return saved ? JSON.parse(saved) : false;
  });
  
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);
  
  const { toast } = useToast();
  const audioManager = AudioManager.getInstance();

  // Load saved data on mount
  useEffect(() => {
    const savedMessages = loadFromLocalStorage();
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
        const thoughtMessage: Message = {
          type: "system",
          content: `${getThoughtEmoji(thought.type)} ${thought.content}`
        };
        setMessages(prev => {
          // Replace thinking indicator or add new thought
          const lastMsg = prev[prev.length - 1];
          if (lastMsg.type === "system" && (lastMsg.content.includes("🤔") || lastMsg.content.includes("💭"))) {
            return [...prev.slice(0, -1), thoughtMessage];
          }
          return [...prev, thoughtMessage];
        });
      };

      const response = await callDeepSeek(
        message, 
        apiKeys.deepseek,
        messages.slice(-4), // Keep last 4 messages for context
        onThoughtUpdate
      );
      
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
        const updatedMessages: Message[] = [
          ...newMessages
        ];

        // Add thought process if available
        if (response.thoughtProcess?.length) {
          response.thoughtProcess.forEach(thought => {
            updatedMessages.push({
              type: "system",
              content: `${getThoughtEmoji(thought.type)} ${thought.content}`
            });
          });
        }

        // Add final response
        updatedMessages.push(
          { type: "reasoning", content: response.reasoning },
          { type: "answer", content: response.content }
        );

        setMessages(updatedMessages);
        saveToLocalStorage(updatedMessages.slice(1));

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
      saveToLocalStorage(errorMessages.slice(1));
    } finally {
      setIsProcessing(false);
      setShowOptions(true);
    }
  };

  const handleArchitectEscalation = async (originalMessage: string) => {
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
      content: "👨‍💻 Escalating to architect review..." 
    }]);

    try {
      const review = await callArchitectLLM(messages, apiKeys.gemini);
      if (review) {
        setMessages(prev => [...prev.filter(m => m.content !== "👨‍💻 Escalating to architect review..."), { 
          type: "answer", 
          content: `🏗️ Architect Review:\n\n${review.content}` 
        }]);
      }
    } catch (error) {
      console.error("Architect review failed:", error);
      toast({
        title: "Architect Review Failed",
        description: "Unable to get architect review at this time. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptionSelect = async (choice: number) => {
    if (choice === 4) {
      setMessages([messages[0]]);
      saveToLocalStorage([]);
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
          saveToLocalStorage(updatedMessages.slice(1));
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
        {messages.map((message, index) => (
          message.type === "answer" && message.content.includes('"criticalIssues"') ? (
            <ArchitectReview key={index} review={JSON.parse(message.content)} />
          ) : (
            <ChatMessage key={index} type={message.type} content={message.content} />
          )
        ))}
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