import { useEffect, useReducer } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { ApiError, Card } from "@/types";

const MAX_FIELD = 100;

interface FieldErrors {
  front?: string;
  back?: string;
  form?: string;
}

interface CardFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card?: Card;
  onSaved: (card: Card) => void;
}

interface FormState {
  front: string;
  back: string;
  fieldErrors: FieldErrors;
  isSaving: boolean;
  saveError: string | null;
}

type FormAction =
  | { type: "setFront"; value: string }
  | { type: "setBack"; value: string }
  | { type: "setFieldErrors"; errors: FieldErrors }
  | { type: "setSaving"; value: boolean }
  | { type: "setSaveError"; error: string | null }
  | { type: "reset"; front: string; back: string };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "setFront":
      return {
        ...state,
        front: action.value,
        fieldErrors: { ...state.fieldErrors, front: undefined },
      };
    case "setBack":
      return {
        ...state,
        back: action.value,
        fieldErrors: { ...state.fieldErrors, back: undefined },
      };
    case "setFieldErrors":
      return { ...state, fieldErrors: action.errors };
    case "setSaving":
      return { ...state, isSaving: action.value };
    case "setSaveError":
      return { ...state, saveError: action.error };
    case "reset":
      return {
        front: action.front,
        back: action.back,
        fieldErrors: {},
        isSaving: false,
        saveError: null,
      };
    default:
      return state;
  }
}

function validateField(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Required";
  if (trimmed.length > MAX_FIELD) return `Must be ${MAX_FIELD} characters or fewer`;
  return undefined;
}

export default function CardFormDialog({ open, onOpenChange, card, onSaved }: CardFormDialogProps) {
  const [state, dispatch] = useReducer(formReducer, {
    front: "",
    back: "",
    fieldErrors: {},
    isSaving: false,
    saveError: null,
  });

  useEffect(() => {
    if (open) {
      dispatch({
        type: "reset",
        front: card?.front ?? "",
        back: card?.back ?? "",
      });
    }
  }, [open, card]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors: FieldErrors = {
      front: validateField(state.front),
      back: validateField(state.back),
    };

    if (errors.front || errors.back) {
      dispatch({ type: "setFieldErrors", errors });
      return;
    }

    dispatch({ type: "setSaving", value: true });
    dispatch({ type: "setSaveError", error: null });

    try {
      const method = card ? "PATCH" : "POST";
      const url = card ? `/api/cards/${card.id}` : "/api/cards";
      const body = {
        front: state.front.trim(),
        back: state.back.trim(),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiError | null;
        dispatch({
          type: "setSaveError",
          error: err?.error.message ?? "Could not save the card. Please try again.",
        });
        dispatch({ type: "setSaving", value: false });
        return;
      }

      const data = (await res.json()) as { card: Card };
      onSaved(data.card);
      onOpenChange(false);
    } catch {
      dispatch({
        type: "setSaveError",
        error: "Could not save the card. Please try again.",
      });
      dispatch({ type: "setSaving", value: false });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "Add card"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-front">Front</Label>
            <Input
              id="form-front"
              value={state.front}
              maxLength={MAX_FIELD}
              placeholder="Question or prompt"
              aria-invalid={!!state.fieldErrors.front}
              disabled={state.isSaving}
              onChange={(e) => {
                dispatch({ type: "setFront", value: e.target.value });
              }}
            />
            {state.fieldErrors.front && <p className="text-destructive text-sm">{state.fieldErrors.front}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="form-back">Back</Label>
            <Input
              id="form-back"
              value={state.back}
              maxLength={MAX_FIELD}
              placeholder="Answer or response"
              aria-invalid={!!state.fieldErrors.back}
              disabled={state.isSaving}
              onChange={(e) => {
                dispatch({ type: "setBack", value: e.target.value });
              }}
            />
            {state.fieldErrors.back && <p className="text-destructive text-sm">{state.fieldErrors.back}</p>}
          </div>

          {state.saveError && <p className="text-destructive text-sm">{state.saveError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={state.isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={state.isSaving}>
              {state.isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {card ? "Update" : "Add"} card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
