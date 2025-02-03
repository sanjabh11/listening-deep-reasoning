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
import { Loader2, Volume2, VolumeX } from "lucide-react";

const AUDIO_ENABLED_KEY = 'audio_enabled';

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
  
  const { toast } = useToast();
  const audioManager = AudioManager.getInstance();

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

    const initialMessages: Message[] = [
      {
        type: "system",
        content: "🛠️ Interactive Reasoning Explorer Initialized\n🔗 DeepSeek R1 Model: Chain-of-Thought Enabled\n🔊 Voice Feedback: Ready (Muted by default)",
      },
      ...savedMessages,
    ];
    setMessages(initialMessages);
  }, []);

  useEffect(() => {
    localStorage.setItem(AUDIO_ENABLED_KEY, JSON.stringify(audioEnabled));
  }, [audioEnabled]);

  const handleApiKeysSubmit = (keys: { deepseek: string; elevenlabs?: string; gemini?: string }) => {
    setApiKeys({
      deepseek: keys.deepseek,
      elevenlabs: keys.elevenlabs || null,
      gemini: keys.gemini || null
    });
    saveApiKeys(keys);
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    if (!audioEnabled) {
      audioManager.stop();
    }
  };

  const handleSend = async (message: string) => {
    if (!apiKeys.deepseek) {
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
      const response = await callDeepSeek(message, apiKeys.deepseek);
      
      if (response) {
        const updatedMessages: Message[] = [
          ...newMessages,
          { type: "reasoning", content: response.reasoning },
          { type: "answer", content: response.content },
        ];
        setMessages(updatedMessages);
        saveToLocalStorage(updatedMessages.slice(1));
        setShowOptions(true);

        if (audioEnabled && apiKeys.elevenlabs) {
          await audioManager.generateAndPlaySpeech(response.reasoning, apiKeys.elevenlabs);
          await audioManager.generateAndPlaySpeech(response.content, apiKeys.elevenlabs);
        }
      }
    } catch (error) {
      console.error("API call failed:", error);
      toast({
        title: "Error",
        description: "Failed to get a response. Please check your API key and try again.",
        variant: "destructive",
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

  if (!apiKeys.deepseek) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ApiKeyManager 
          onSubmit={handleApiKeysSubmit}
          initialKeys={apiKeys}
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
    </div>
  );
};

export default Index;