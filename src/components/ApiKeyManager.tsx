import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeySchema } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ApiKeyManagerProps {
  onSubmit: (keys: { [key: string]: string }) => void;
  initialKeys: {
    deepseek: string | null;
    elevenlabs: string | null;
    gemini: string | null;
  };
  show: boolean;
  setShow: (show: boolean) => void;
}

export const ApiKeyManager = ({ onSubmit, initialKeys, show, setShow }: ApiKeyManagerProps) => {
  const [keys, setKeys] = useState({
    deepseek: initialKeys.deepseek || "",
    elevenlabs: initialKeys.elevenlabs || "",
    gemini: initialKeys.gemini || ""
  });
  
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const { toast } = useToast();

  useEffect(() => {
    setKeys({
      deepseek: initialKeys.deepseek || "",
      elevenlabs: initialKeys.elevenlabs || "",
      gemini: initialKeys.gemini || ""
    });
  }, [initialKeys]);

  const validateKeys = () => {
    try {
      const validKeys: { [key: string]: string } = {};
      const newErrors: { [key: string]: string } = {};

      // Only include non-empty keys
      if (keys.deepseek) validKeys.deepseek = keys.deepseek;
      if (keys.elevenlabs) validKeys.elevenlabs = keys.elevenlabs;
      if (keys.gemini) validKeys.gemini = keys.gemini;

      // Validate using Zod schema
      ApiKeySchema.parse(validKeys);
      setErrors({});
      return validKeys;
    } catch (error: any) {
      const newErrors: { [key: string]: string } = {};
      if (error.errors) {
        error.errors.forEach((err: any) => {
          const field = err.path[0];
          newErrors[field] = err.message;
        });
      }
      setErrors(newErrors);
      return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validKeys = validateKeys();
    if (!validKeys) {
      toast({
        title: "Validation Error",
        description: "Please check your API key formats and try again.",
        variant: "destructive"
      });
      return;
    }

    if (!validKeys.deepseek) {
      toast({
        title: "DeepSeek API Key Required",
        description: "Please enter your DeepSeek API key to continue.",
        variant: "destructive"
      });
      return;
    }

    try {
      onSubmit(validKeys);
      setShow(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save API keys",
        variant: "destructive"
      });
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">API Settings</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="deepseek">DeepSeek API Key (Required)</Label>
            <Input
              id="deepseek"
              type="password"
              value={keys.deepseek}
              onChange={(e) => setKeys(prev => ({ ...prev, deepseek: e.target.value }))}
              className={errors.deepseek ? "border-red-500" : ""}
            />
            {errors.deepseek && (
              <p className="text-red-500 text-sm mt-1">{errors.deepseek}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="elevenlabs">ElevenLabs API Key (Optional)</Label>
            <Input
              id="elevenlabs"
              type="password"
              value={keys.elevenlabs}
              onChange={(e) => setKeys(prev => ({ ...prev, elevenlabs: e.target.value }))}
              className={errors.elevenlabs ? "border-red-500" : ""}
            />
            {errors.elevenlabs && (
              <p className="text-red-500 text-sm mt-1">{errors.elevenlabs}</p>
            )}
          </div>

          <div>
            <Label htmlFor="gemini">Gemini API Key (Optional)</Label>
            <Input
              id="gemini"
              type="password"
              value={keys.gemini}
              onChange={(e) => setKeys(prev => ({ ...prev, gemini: e.target.value }))}
              className={errors.gemini ? "border-red-500" : ""}
            />
            {errors.gemini && (
              <p className="text-red-500 text-sm mt-1">{errors.gemini}</p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setShow(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Settings</Button>
          </div>
        </form>
      </div>
    </div>
  );
};