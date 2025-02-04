import { ArchitectReviewType } from "@/lib/types";
import { RevisionButton } from "./RevisionButton";

interface ArchitectReviewProps {
  review: ArchitectReviewType;
  onRevisionRequest?: () => void;
  isProcessing?: boolean;
  revisionNumber?: number;
}

export function ArchitectReview({ review, onRevisionRequest, isProcessing, revisionNumber = 1 }: ArchitectReviewProps) {
  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-terminal-red">Critical Issues</h3>
        <ul className="list-disc pl-5 space-y-1">
          {review.criticalIssues.map((issue, i) => (
            <li key={i} className="text-terminal-red">{issue}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-terminal-yellow">Potential Problems</h3>
        <ul className="list-disc pl-5 space-y-1">
          {review.potentialProblems.map((problem, i) => (
            <li key={i} className="text-terminal-yellow">{problem}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-terminal-cyan">Improvements</h3>
        <ul className="list-disc pl-5 space-y-1">
          {review.improvements.map((improvement, i) => (
            <li key={i} className="text-terminal-cyan">{improvement}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="font-semibold">
          Verdict:{" "}
          <span className={review.verdict === "APPROVED" ? "text-terminal-green" : "text-terminal-red"}>
            {review.verdict}
          </span>
        </div>
        {review.verdict === "NEEDS_REVISION" && onRevisionRequest && (
          <RevisionButton
            onClick={onRevisionRequest}
            isProcessing={isProcessing}
            revisionNumber={revisionNumber}
            improvements={review.improvements}
          />
        )}
      </div>
    </div>
  );
}