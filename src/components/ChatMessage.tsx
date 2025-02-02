import { cn } from "@/lib/utils";

interface ChatMessageProps {
  type: "user" | "reasoning" | "answer" | "system";
  content: string;
}

export function ChatMessage({ type, content }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg mb-4 message-enter terminal-text",
        type === "user" && "bg-secondary text-foreground",
        type === "reasoning" && "bg-transparent text-terminal-yellow",
        type === "answer" && "bg-transparent text-terminal-cyan",
        type === "system" && "bg-transparent text-terminal-magenta italic"
      )}
    >
      {type !== "user" && (
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          {type}
        </div>
      )}
      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  );
}