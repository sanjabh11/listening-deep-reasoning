import { toast } from "@/hooks/use-toast";

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel voice

export class AudioManager {
  private static instance: AudioManager;
  private audio: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private isPlaying = false;

  private constructor() {}

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  async generateAndPlaySpeech(text: string, apiKey: string) {
    try {
      const response = await fetch(`${ELEVEN_LABS_API_URL}/${VOICE_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate speech");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!this.audio) {
        this.audio = new Audio();
        this.audio.onended = () => this.playNext();
      }

      this.queue.push(audioUrl);
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (error) {
      console.error("Speech generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate speech",
        variant: "destructive",
      });
    }
  }

  private playNext() {
    if (!this.audio || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    const nextUrl = this.queue.shift();
    if (nextUrl) {
      this.audio.src = nextUrl;
      this.audio.play();
      this.isPlaying = true;
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.queue = [];
    this.isPlaying = false;
  }
}