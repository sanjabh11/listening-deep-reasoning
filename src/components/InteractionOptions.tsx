import { Button } from "@/components/ui/button";

interface InteractionOptionsProps {
  onSelect: (choice: number) => void;
  disabled?: boolean;
}

export function InteractionOptions({ onSelect, disabled }: InteractionOptionsProps) {
  const options = [
    "Ask follow-up question",
    "Explain reasoning in more detail",
    "Show me examples",
    "Start new topic",
    "Let architect review the solution",
  ];

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="text-terminal-magenta mb-2">🔍 How would you like to proceed?</div>
      {options.map((option, index) => (
        <Button
          key={index}
          variant="outline"
          onClick={() => onSelect(index + 1)}
          disabled={disabled}
          className="justify-start text-left hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {index + 1}. {option}
        </Button>
      ))}
    </div>
  );
}