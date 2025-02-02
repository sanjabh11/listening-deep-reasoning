import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
}

export function ApiKeyInput({ 
  onSubmit, 
  title = "Enter DeepSeek API Key",
  description = "Your API key will only be stored in memory during this session.",
  placeholder = "sk-..."
}: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid API key",
        variant: "destructive",
      });
      return;
    }
    onSubmit(apiKey.trim());
    setApiKey("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6 bg-card rounded-lg shadow-lg">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="space-y-2">
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={placeholder}
          className="w-full"
        />
        <Button type="submit" className="w-full">
          Submit
        </Button>
      </div>
    </form>
  );
}