import { useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { InteractionOptions } from "@/components/InteractionOptions";

interface Message {
  type: "user" | "reasoning" | "answer" | "system";
  content: string;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "system",
      content: "🛠️ Interactive Reasoning Explorer Initialized\n🔗 DeepSeek R1 Model: Chain-of-Thought Enabled",
    },
  ]);
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSend = async (message: string) => {
    setIsProcessing(true);
    setShowOptions(false);

    // Add user message
    setMessages((prev) => [...prev, { type: "user", content: message }]);

    // Simulate API response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          type: "reasoning",
          content: "Analyzing the question and breaking it down into components...\nConsidering relevant context and potential approaches...",
        },
        {
          type: "answer",
          content: "This is a simulated response. In a real implementation, this would be streaming from the DeepSeek API.",
        },
      ]);
      setIsProcessing(false);
      setShowOptions(true);
    }, 1500);
  };

  const handleOptionSelect = (choice: number) => {
    if (choice === 4) {
      // Start new topic
      setMessages([messages[0]]);
      setShowOptions(false);
    } else {
      handleSend(`Option ${choice} selected`);
    }
  };

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