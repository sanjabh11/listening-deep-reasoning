import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface RevisionButtonProps {
  onClick: () => void;
  revisionNumber?: number;
  isProcessing?: boolean;
  improvements?: string[];
}

export const RevisionButton = ({
  onClick,
  revisionNumber = 1,
  isProcessing = false,
  improvements = []
}: RevisionButtonProps) => {
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={isProcessing}
        className="flex items-center gap-2 mt-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full justify-center"
      >
        <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
        {isProcessing ? 'Sending back to Engineer...' : `Send Back to Engineer (Revision #${revisionNumber})`}
      </Button>
      {improvements.length > 0 && (
        <div className="text-sm text-gray-600 italic">
          Suggested improvements:
          <ul className="list-disc pl-5 mt-1">
            {improvements.map((improvement, index) => (
              <li key={index}>{improvement}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
