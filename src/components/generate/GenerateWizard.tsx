import React, { useState } from "react";
import { Loader2, Sparkles, Check, Pencil, Trash2, RotateCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ApiError, GenerateResponse, GeneratedCard } from "@/types";

const MAX_TEXT = 5000;
const MAX_FIELD = 100;

type WizardStatus = "input" | "generating" | "reviewing" | "empty" | "done";

interface FieldErrors {
  front?: string;
  back?: string;
}

function validateField(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Required";
  if (trimmed.length > MAX_FIELD) return `Must be ${MAX_FIELD} characters or fewer`;
  return undefined;
}

export default function GenerateWizard() {
  const [status, setStatus] = useState<WizardStatus>("input");
  const [text, setText] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [index, setIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function loadCard(list: GeneratedCard[], i: number) {
    setFront(list[i].front);
    setBack(list[i].back);
    setIsEditing(false);
    setFieldErrors({});
    setSaveError(null);
    setIndex(i);
  }

  async function handleGenerate() {
    if (!text.trim() || text.length > MAX_TEXT) return;
    setStatus("generating");
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiError | null;
        setGenerateError(err?.error.message ?? "Card generation failed. Please try again.");
        setStatus("input");
        return;
      }
      const data = (await res.json()) as GenerateResponse;
      if (data.cards.length === 0) {
        setStatus("empty");
        return;
      }
      setCards(data.cards);
      setSavedCount(0);
      loadCard(data.cards, 0);
      setStatus("reviewing");
    } catch {
      setGenerateError("Card generation failed. Please try again.");
      setStatus("input");
    }
  }

  function advance() {
    const next = index + 1;
    if (next >= cards.length) {
      setStatus("done");
      return;
    }
    loadCard(cards, next);
  }

  async function handleAccept() {
    const errors: FieldErrors = {
      front: validateField(front),
      back: validateField(back),
    };
    if (errors.front || errors.back) {
      setFieldErrors(errors);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: front.trim(), back: back.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiError | null;
        setSaveError(err?.error.message ?? "Could not save the card. Please try again.");
        return;
      }
      setSavedCount((c) => c + 1);
      advance();
    } catch {
      setSaveError("Could not save the card. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete() {
    advance();
  }

  function resetToInput() {
    setStatus("input");
    setCards([]);
    setIndex(0);
    setSavedCount(0);
    setGenerateError(null);
  }

  if (status === "generating") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-8 animate-spin" />
          <p>Generating cards…</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "empty") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>No cards found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            We couldn&apos;t extract any flashcards from that text. Try a longer or more detailed passage.
          </p>
          <Button onClick={resetToInput}>Back to text</Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "done") {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>All done 🎉</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            You saved <span className="text-foreground font-semibold">{savedCount}</span> of {cards.length}{" "}
            {cards.length === 1 ? "card" : "cards"} to your deck.
          </p>
          <div className="flex gap-3">
            <Button asChild>
              <a href="/deck">View deck</a>
            </Button>
            <Button variant="outline" onClick={resetToInput}>
              Generate more
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "reviewing") {
    const total = cards.length;
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Review card</span>
            <span className="text-muted-foreground text-sm font-normal">
              {index + 1} / {total}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="card-front">Front</Label>
                <Input
                  id="card-front"
                  value={front}
                  maxLength={MAX_FIELD}
                  aria-invalid={!!fieldErrors.front}
                  onChange={(e) => {
                    setFront(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, front: undefined }));
                  }}
                />
                {fieldErrors.front && <p className="text-destructive text-sm">{fieldErrors.front}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-back">Back</Label>
                <Input
                  id="card-back"
                  value={back}
                  maxLength={MAX_FIELD}
                  aria-invalid={!!fieldErrors.back}
                  onChange={(e) => {
                    setBack(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, back: undefined }));
                  }}
                />
                {fieldErrors.back && <p className="text-destructive text-sm">{fieldErrors.back}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Front</p>
                <p className="mt-1">{front}</p>
              </div>
              <div className="border-t pt-3">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Back</p>
                <p className="mt-1">{back}</p>
              </div>
            </div>
          )}

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleAccept} disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Accept
            </Button>
            {!isEditing && (
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(true);
                }}
                disabled={isSaving}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            <Button variant="ghost" onClick={handleDelete} disabled={isSaving}>
              <Trash2 className="size-4" />
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overLimit = text.length > MAX_TEXT;

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Generate flashcards</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="source-text">Paste your text</Label>
          <Textarea
            id="source-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            placeholder="Paste a passage (up to 5,000 characters) to turn into flashcards…"
            className="min-h-48"
            aria-invalid={overLimit}
          />
          <div className={cn("text-right text-sm", overLimit ? "text-destructive" : "text-muted-foreground")}>
            {text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}
          </div>
        </div>

        {generateError && (
          <div className="space-y-2">
            <p className="text-destructive text-sm">{generateError}</p>
            <Button variant="outline" onClick={handleGenerate} disabled={!text.trim() || overLimit}>
              <RotateCw className="size-4" />
              Retry
            </Button>
          </div>
        )}

        <Button onClick={handleGenerate} disabled={!text.trim() || overLimit}>
          <Sparkles className="size-4" />
          Generate
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
