import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { ArchitectReview } from "@/components/ArchitectReview";
import { callDeepSeek, saveToLocalStorage, loadFromLocalStorage, Message, saveApiKeys, loadApiKeys } from "@/lib/api";
import { callArchitectLLM } from "@/lib/architect";
import { AudioManager } from "@/lib/audio";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [elevenLabsKey, setElevenLabsKey] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const { toast } = useToast();
  const audioManager = AudioManager.getInstance();

  useEffect(() => {
    const savedMessages = loadFromLocalStorage();
    const savedKeys = loadApiKeys();
    
    if (savedKeys) {
      setApiKey(savedKeys.deepseek);
      setElevenLabsKey(savedKeys.elevenlabs);
      setGeminiKey(savedKeys.gemini);
    }

    const initialMessages: Message[] = [
      {
        type: "system",
        content: "🛠️ Interactive Reasoning Explorer Initialized\n🔗 DeepSeek R1 Model: Chain-of-Thought Enabled\n🔊 Voice Feedback: Ready",
      },
      ...savedMessages,
    ];
    setMessages(initialMessages);
  }, []);

  const handleApiKeySubmit = (key: string) => {
    setApiKey(key);
    const currentKeys = loadApiKeys() || {};
    saveApiKeys({ ...currentKeys, deepseek: key });
  };

  const handleElevenLabsKeySubmit = (key: string) => {
    setElevenLabsKey(key);
    const currentKeys = loadApiKeys() || {};
    saveApiKeys({ ...currentKeys, elevenlabs: key });
  };

  const handleGeminiKeySubmit = (key: string) => {
    setGeminiKey(key);
    const currentKeys = loadApiKeys() || {};
    saveApiKeys({ ...currentKeys, gemini: key });
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    if (!audioEnabled) {
      audioManager.stop();
    }
  };

  const handleSend = async (message: string) => {
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your DeepSeek API key first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setShowOptions(false);

    const newMessages: Message[] = [
      ...messages,
      { type: "user", content: message }
    ];
    setMessages(newMessages);

    try {
      const response = await callDeepSeek(message, apiKey);
      
      if (response) {
        const updatedMessages: Message[] = [
          ...newMessages,
          { type: "reasoning", content: response.reasoning },
          { type: "answer", content: response.content },
        ];
        setMessages(updatedMessages);
        saveToLocalStorage(updatedMessages.slice(1));
        setShowOptions(true);

        // Generate speech for reasoning and answer if ElevenLabs key is available
        if (elevenLabsKey) {
          await audioManager.generateAndPlaySpeech(response.reasoning, elevenLabsKey);
          await audioManager.generateAndPlaySpeech(response.content, elevenLabsKey);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to get a response. Please check your API key and try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptionSelect = async (choice: number) => {
    if (choice === 4) {
      audioManager.stop();
      setMessages([messages[0]]);
      saveToLocalStorage([]);
      setShowOptions(false);
    } else if (choice === 5) {
      if (!geminiKey) {
        toast({
          title: "Error",
          description: "Please enter your Gemini API key first",
          variant: "destructive",
        });
        return;
      }

      setIsProcessing(true);
      setShowOptions(false);

      try {
        const review = await callArchitectLLM(messages, geminiKey);
        if (review) {
          const updatedMessages: Message[] = [
            ...messages,
            { type: "system", content: "🔍 Architect Review Requested" },
            { 
              type: "reasoning", 
              content: "Analyzing solution quality, architecture, and potential improvements..." 
            },
            { 
              type: "answer", 
              content: JSON.stringify(review, null, 2)
            }
          ];
          setMessages(updatedMessages);
          saveToLocalStorage(updatedMessages.slice(1));
        } else {
          toast({
            title: "Error",
            description: "Failed to get architect review. Please try again.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "An unexpected error occurred during review.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
        setShowOptions(true);
      }
    } else {
      const prompts = {
        1: "Ask a follow-up question",
        2: "Explain the reasoning in more detail",
        3: "Show examples to support this reasoning",
      };
      handleSend(prompts[choice as 1 | 2 | 3]);
    }
  };

  if (!apiKey || !elevenLabsKey || !geminiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        {!apiKey ? (
          <ApiKeyInput onSubmit={handleApiKeySubmit} />
        ) : !elevenLabsKey ? (
          <ApiKeyInput 
            onSubmit={handleElevenLabsKeySubmit}
            title="Enter ElevenLabs API Key"
            description="Your API key will only be stored in memory during this session."
            placeholder="Your ElevenLabs API key..."
          />
        ) : (
          <ApiKeyInput 
            onSubmit={handleGeminiKeySubmit}
            title="Enter Gemini API Key"
            description="Your API key will only be stored in memory during this session."
            placeholder="Your Gemini API key..."
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-4xl mx-auto p-4">
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAudio}
          className="flex items-center gap-2"
        >
          {audioEnabled ? '🔊 Mute' : '🔇 Unmute'}
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
    </div>
  );
};

export default Index;
