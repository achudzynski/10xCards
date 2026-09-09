import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReviewRating } from "@/types";

const RATINGS: { value: ReviewRating; label: string }[] = [
  { value: 0, label: "Forgot" },
  { value: 1, label: "Wrong" },
  { value: 2, label: "Hard" },
  { value: 3, label: "OK" },
  { value: 4, label: "Good" },
  { value: 5, label: "Easy" },
];

interface ReviewRatingScaleProps {
  onRate: (rating: ReviewRating) => void;
  disabled?: boolean;
}

export default function ReviewRatingScale({ onRate, disabled = false }: ReviewRatingScaleProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Rate your recall">
      {RATINGS.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          variant={value < 3 ? "destructive" : "default"}
          className={cn(value >= 3 && "bg-emerald-600 hover:bg-emerald-600/90")}
          disabled={disabled}
          onClick={() => {
            onRate(value);
          }}
        >
          {value} · {label}
        </Button>
      ))}
    </div>
  );
}
