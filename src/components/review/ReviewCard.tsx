import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReviewRatingScale from "./ReviewRatingScale";
import type { ReviewCard as ReviewCardType, ReviewRating } from "@/types";

interface ReviewCardProps {
  card: ReviewCardType;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: ReviewRating) => void;
  disabled?: boolean;
}

export default function ReviewCard({ card, revealed, onReveal, onRate, disabled = false }: ReviewCardProps) {
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Front</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-lg">{card.front}</p>

        {revealed ? (
          <div className="space-y-4">
            <div className="border-t pt-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Back</p>
              <p className="mt-1 text-lg">{card.back}</p>
            </div>
            <ReviewRatingScale onRate={onRate} disabled={disabled} />
          </div>
        ) : (
          <Button onClick={onReveal} disabled={disabled}>
            Show answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
