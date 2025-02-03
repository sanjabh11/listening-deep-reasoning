import { useEffect, useState } from 'react';
import { ThoughtProcess } from '@/lib/api';

interface ThoughtProcessProps {
  thought: ThoughtProcess;
}

export const ThoughtProcessDisplay = ({ thought }: ThoughtProcessProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, [thought]);

  const getThoughtColor = (type: string): string => {
    switch (type) {
      case 'thinking': return 'bg-blue-100 border-blue-300';
      case 'planning': return 'bg-green-100 border-green-300';
      case 'analyzing': return 'bg-purple-100 border-purple-300';
      case 'solving': return 'bg-yellow-100 border-yellow-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const getThoughtEmoji = (type: string): string => {
    switch (type) {
      case 'thinking': return '💭';
      case 'planning': return '📝';
      case 'analyzing': return '🔍';
      case 'solving': return '⚡';
      default: return '💡';
    }
  };

  return (
    <div
      className={`transition-all duration-500 ease-in-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${getThoughtColor(thought.type)} p-4 rounded-lg border mb-4`}
    >
      <div className="flex items-start space-x-2">
        <span className="text-2xl">{getThoughtEmoji(thought.type)}</span>
        <div className="flex-1">
          <div className="font-medium capitalize mb-1">
            {thought.type}...
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {thought.content}
          </div>
        </div>
      </div>
    </div>
  );
};
