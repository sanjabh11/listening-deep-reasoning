import React from 'react';
import { MessageType } from '@/lib/api';
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  type: MessageType;
  content: string;
}

const getMessageStyle = (type: MessageType) => {
  switch (type) {
    case 'user':
      return 'bg-primary/10 text-primary';
    case 'answer':
      return 'bg-secondary/10 text-secondary';
    case 'reasoning':
      return 'bg-muted/10 text-muted-foreground';
    case 'system':
      return 'bg-accent/10 text-accent-foreground italic';
    default:
      return 'bg-background text-foreground';
  }
};

const getMessagePrefix = (type: MessageType) => {
  switch (type) {
    case 'user':
      return '👤 ';
    case 'answer':
      return '🤖 ';
    case 'reasoning':
      return '💭 ';
    case 'system':
      return type.includes('thinking') ? '🤔 ' : '';
    default:
      return '';
  }
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ type, content }) => {
  // Handle empty or invalid content
  if (!content || typeof content !== 'string') {
    console.warn('Invalid message content:', content);
    return null;
  }

  const messageStyle = getMessageStyle(type);
  const prefix = getMessagePrefix(type);

  // Format the content based on type
  const formattedContent = React.useMemo(() => {
    try {
      // For system messages or thinking updates, display immediately
      if (type === 'system' || content.includes('Analyzing') || content.includes('Generating') || content.includes('Retrying')) {
        return <p className="whitespace-pre-wrap">{content}</p>;
      }

      // For reasoning messages, format nicely
      if (type === 'reasoning') {
        return content.split('\n').map((line, i) => (
          <p key={i} className="mb-2">{line}</p>
        ));
      }

      // For answer messages, try to parse code blocks
      if (type === 'answer') {
        const parts = content.split(/(```[a-z]*\n[\s\S]*?\n```)/g);
        return parts.map((part, i) => {
          if (part.startsWith('```')) {
            const code = part.replace(/```[a-z]*\n|```/g, '');
            return (
              <pre key={i} className="bg-muted p-4 rounded-lg my-2 overflow-x-auto">
                <code>{code}</code>
              </pre>
            );
          }
          return <p key={i} className="mb-2 whitespace-pre-wrap">{part}</p>;
        });
      }

      // For user messages, simple paragraph
      return <p className="whitespace-pre-wrap">{content}</p>;
    } catch (error) {
      console.error('Error formatting message:', error);
      return <p className="whitespace-pre-wrap">{content}</p>;
    }
  }, [content, type]);

  return (
    <div 
      className={`p-4 rounded-lg mb-4 ${messageStyle} relative animate-in fade-in-0 duration-300`}
      style={{ opacity: 1 }}
    >
      <div className="flex items-start gap-2">
        <span className="font-bold min-w-[24px]">{prefix}</span>
        <div className="flex-1 overflow-x-auto">
          {formattedContent}
        </div>
      </div>
    </div>
  );
};