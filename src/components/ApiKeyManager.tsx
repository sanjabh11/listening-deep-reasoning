import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiKeyManagerProps {
  onSubmit: (keys: {
    deepseek: string;
    elevenlabs?: string;
    gemini?: string;
  }) => void;
  initialKeys?: {
    deepseek?: string;
    elevenlabs?: string;
    gemini?: string;
  };
}

export function ApiKeyManager({ onSubmit, initialKeys }: ApiKeyManagerProps) {
  const [deepseekKey, setDeepseekKey] = useState(initialKeys?.deepseek || "");
  const [elevenLabsKey, setElevenLabsKey] = useState(initialKeys?.elevenlabs || "");
  const [geminiKey, setGeminiKey] = useState(initialKeys?.gemini || "");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deepseekKey.trim()) {
      toast({
        title: "Error",
        description: "DeepSeek API key is required",
        variant: "destructive",
      });
      return;
    }

    const keys = {
      deepseek: deepseekKey.trim(),
      ...(elevenLabsKey && { elevenlabs: elevenLabsKey.trim() }),
      ...(geminiKey && { gemini: geminiKey.trim() }),
    };

    onSubmit(keys);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>API Key Configuration</CardTitle>
          <CardDescription>
            Configure your API keys to use the application. Only DeepSeek API key is required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">DeepSeek API Key (Required)</label>
            <Input
              type="password"
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="sk-..."
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">ElevenLabs API Key (Optional)</label>
            <Input
              type="password"
              value={elevenLabsKey}
              onChange={(e) => setElevenLabsKey(e.target.value)}
              placeholder="Enter to enable voice feedback"
            />
            <p className="text-xs text-muted-foreground">
              Add this key if you want to hear the conversation
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Gemini API Key (Optional)</label>
            <Input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Enter for architect review feature"
            />
            <p className="text-xs text-muted-foreground">
              Add this key if you want to get solutions reviewed by the architect
            </p>
          </div>

          <Button type="submit" className="w-full">
            Save API Keys
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}