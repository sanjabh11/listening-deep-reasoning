import { toast } from "@/hooks/use-toast";

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel voice

export class AudioManager {
  private static instance: AudioManager;
  private audio: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private isPlaying = false;
  private hasUserInteracted = false;

  private constructor() {
    // Add listener for user interaction
    const handleInteraction = () => {
      this.hasUserInteracted = true;
      // Remove listeners after first interaction
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  async generateAndPlaySpeech(text: string, apiKey: string) {
    // Check if audio is enabled in localStorage
    const audioEnabled = localStorage.getItem('audio_enabled');
    if (audioEnabled === 'false') {
      return;
    }

    // Don't generate speech for code blocks or system messages
    if (text.includes('```') || text.includes('criticalIssues') || text.includes('"status":')) {
      return;
    }

    try {
      if (!this.hasUserInteracted) {
        toast({
          title: "Audio Playback",
          description: "Please interact with the page (click or press a key) to enable audio playback.",
          variant: "default",
        });
        return;
      }

      const response = await fetch(`${ELEVEN_LABS_API_URL}/${VOICE_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",  // Changed to use the more efficient turbo model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.detail?.status === "quota_exceeded") {
          toast({
            title: "ElevenLabs Quota Exceeded",
            description: errorData.detail.message || "Your ElevenLabs account has insufficient credits. Please check your quota.",
            variant: "destructive",
          });
          return;
        }
        throw new Error("Failed to generate speech");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!this.audio) {
        this.audio = new Audio();
        this.audio.onended = () => this.playNext();
        this.audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          this.playNext();
          toast({
            title: "Audio Error",
            description: "There was an error playing the audio. Skipping to next.",
            variant: "destructive",
          });
        };
      }

      this.queue.push(audioUrl);
      if (!this.isPlaying) {
        await this.playNext();
      }
    } catch (error) {
      console.error("Speech generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate speech. Please check your API key and quota.",
        variant: "destructive",
      });
    }
  }

  private async playNext() {
    if (!this.audio || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    const nextUrl = this.queue.shift();
    if (nextUrl) {
      try {
        this.audio.src = nextUrl;
        this.isPlaying = true;
        await this.audio.play().catch((error) => {
          console.error("Playback error:", error);
          this.isPlaying = false;
          toast({
            title: "Playback Error",
            description: "Audio playback failed. Please try interacting with the page first.",
            variant: "destructive",
          });
        });
      } catch (error) {
        console.error("Playback error:", error);
        this.isPlaying = false;
        this.playNext(); // Try next audio in queue
      }
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