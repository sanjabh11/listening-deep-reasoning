import { useState, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { callDeepSeek, saveToLocalStorage, loadFromLocalStorage, Message } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const savedMessages = loadFromLocalStorage();
    const initialMessages: Message[] = [
      {
        type: "system",
        content: "🛠️ Interactive Reasoning Explorer Initialized\n🔗 DeepSeek R1 Model: Chain-of-Thought Enabled",
      },
      ...savedMessages,
    ];
    setMessages(initialMessages);
  }, []);

  const handleSend = async (message: string) => {
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your API key first",
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
        saveToLocalStorage(updatedMessages.slice(1)); // Save excluding system message
        setShowOptions(true);
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

  const handleOptionSelect = (choice: number) => {
    if (choice === 4) {
      // Start new topic
      setMessages([messages[0]]);
      saveToLocalStorage([]);
      setShowOptions(false);
    } else {
      const prompts = {
        1: "Ask a follow-up question",
        2: "Explain the reasoning in more detail",
        3: "Show examples to support this reasoning",
      };
      handleSend(prompts[choice as 1 | 2 | 3]);
    }
  };

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ApiKeyInput onSubmit={setApiKey} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col max-w-4xl mx-auto p-4">
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.map((message, index) => (
          <ChatMessage key={index} type={message.type} content={message.content} />
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