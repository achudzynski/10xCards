import { useEffect, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReviewCard from "./ReviewCard";
import type {
  ApiError,
  CurrentReviewSnapshotResponse,
  ReviewCard as ReviewCardType,
  ReviewRating,
  ReviewSession,
  StartReviewSessionResponse,
  SubmitReviewAnswerResponse,
} from "@/types";

type ViewState = "loading" | "idle" | "empty" | "reviewing" | "submitting" | "completed" | "error";

async function parseError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiError | null;
  return body?.error.message ?? fallback;
}

export default function ReviewSessionView() {
  const [state, setState] = useState<ViewState>("loading");
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [currentCard, setCurrentCard] = useState<ReviewCardType | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadCurrent();
  }, []);

  async function loadCurrent() {
    setState("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/review/current", { method: "POST" });
      if (!res.ok) {
        setErrorMessage(await parseError(res, "Could not load your review session."));
        setState("error");
        return;
      }
      const data = (await res.json()) as CurrentReviewSnapshotResponse;
      if (data.session && data.currentCard) {
        setSession(data.session);
        setCurrentCard(data.currentCard);
        setRevealed(false);
        setState("reviewing");
      } else {
        setState("idle");
      }
    } catch {
      setErrorMessage("Could not load your review session.");
      setState("error");
    }
  }

  async function startSession() {
    setState("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/review/session", { method: "POST" });
      if (!res.ok) {
        setErrorMessage(await parseError(res, "Could not start the review session."));
        setState("error");
        return;
      }
      const data = (await res.json()) as StartReviewSessionResponse;
      if (!data.session || !data.currentCard) {
        setState("empty");
        return;
      }
      setSession(data.session);
      setCurrentCard(data.currentCard);
      setRevealed(false);
      setState("reviewing");
    } catch {
      setErrorMessage("Could not start the review session.");
      setState("error");
    }
  }

  async function submitAnswer(rating: ReviewRating) {
    if (!session || !currentCard) return;
    setState("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/review/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, cardId: currentCard.id, rating }),
      });
      if (!res.ok) {
        setErrorMessage(await parseError(res, "Could not submit your answer."));
        setState("error");
        return;
      }
      const data = (await res.json()) as SubmitReviewAnswerResponse;
      setSession(data.session);
      if (data.session.status === "completed" || !data.nextCard) {
        setCurrentCard(null);
        setState("completed");
        return;
      }
      setCurrentCard(data.nextCard);
      setRevealed(false);
      setState("reviewing");
    } catch {
      setErrorMessage("Could not submit your answer.");
      setState("error");
    }
  }

  if (state === "loading") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-8 animate-spin" />
          <p>Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">{errorMessage}</p>
          <Button variant="outline" onClick={() => void loadCurrent()}>
            <RotateCw className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "empty") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Nothing due right now</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">You have no cards due for review. Check back later.</p>
          <Button asChild>
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "completed") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Session complete 🎉</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You answered <span className="text-foreground font-semibold">{session?.answeredCount ?? 0}</span> of{" "}
            {session?.totalCount ?? 0} due {session?.totalCount === 1 ? "card" : "cards"}.
          </p>
          <div className="flex gap-3">
            <Button asChild>
              <a href="/dashboard">Back to dashboard</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/deck">View deck</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === "idle") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Ready to review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Start a review session to go through your due cards.</p>
          <Button onClick={() => void startSession()}>Start review</Button>
        </CardContent>
      </Card>
    );
  }

  // "reviewing" or "submitting"
  if (!session || !currentCard) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <p className="text-muted-foreground text-center text-sm">
        Card {session.currentIndex + 1} / {session.totalCount}
      </p>
      <ReviewCard
        card={currentCard}
        revealed={revealed}
        onReveal={() => {
          setRevealed(true);
        }}
        onRate={(rating) => void submitAnswer(rating)}
        disabled={state === "submitting"}
      />
    </div>
  );
}
