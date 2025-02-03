import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { ArchitectReview } from "@/components/ArchitectReview";
import { callDeepSeek, saveToLocalStorage, loadFromLocalStorage, Message } from "@/lib/api";
import { callArchitectLLM } from "@/lib/architect";
import { AudioManager } from "@/lib/audio";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [elevenLabsKey, setElevenLabsKey] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string | null>(null);
  const { toast } = useToast();
  const audioManager = AudioManager.getInstance();

  useEffect(() => {
    const savedMessages = loadFromLocalStorage();
    const initialMessages: Message[] = [
      {
        type: "system",
        content: "🛠️ Interactive Reasoning Explorer Initialized\n🔗 DeepSeek R1 Model: Chain-of-Thought Enabled\n🔊 Voice Feedback: Ready",
      },
      ...savedMessages,
    ];
    setMessages(initialMessages);
  }, []);

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
          <ApiKeyInput onSubmit={setApiKey} />
        ) : !elevenLabsKey ? (
          <ApiKeyInput 
            onSubmit={setElevenLabsKey}
            title="Enter ElevenLabs API Key"
            description="Your API key will only be stored in memory during this session."
            placeholder="Your ElevenLabs API key..."
          />
        ) : (
          <ApiKeyInput 
            onSubmit={setGeminiKey}
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
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.map((message, index) => (
          message.type === "answer" && message.content.includes('"criticalIssues"') ? (
            <ArchitectReview key={index} review={JSON.parse(message.content)} />
          ) : (
            <ChatMessage key={index} type={message.type} content={message.content} />
          )
        ))}
      </div>
      
      {showOptions && <InteractionOptions onSelect={handleOptionSelect} />}
      
      <div className="sticky bottom-0 bg-background pt-4">
        <ChatInput onSend={handleSend} disabled={isProcessing} />
      </div>
    </div>
  );
};

export default Index;
