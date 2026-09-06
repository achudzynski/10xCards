import { useReducer } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ApiError, Card } from "@/types";

interface DeleteCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card;
  onDeleted: (cardId: string) => void;
}

interface DeleteState {
  isDeleting: boolean;
  deleteError: string | null;
}

type DeleteAction =
  { type: "setDeleting"; value: boolean } | { type: "setError"; error: string | null } | { type: "reset" };

function deleteReducer(state: DeleteState, action: DeleteAction): DeleteState {
  switch (action.type) {
    case "setDeleting":
      return { ...state, isDeleting: action.value };
    case "setError":
      return { ...state, deleteError: action.error };
    case "reset":
      return { isDeleting: false, deleteError: null };
    default:
      return state;
  }
}

export default function DeleteCardDialog({ open, onOpenChange, card, onDeleted }: DeleteCardDialogProps) {
  const [state, dispatch] = useReducer(deleteReducer, {
    isDeleting: false,
    deleteError: null,
  });

  // Reset on dialog open
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      dispatch({ type: "reset" });
    }
    onOpenChange(isOpen);
  };

  async function handleConfirm() {
    dispatch({ type: "setDeleting", value: true });
    dispatch({ type: "setError", error: null });

    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiError | null;
        dispatch({
          type: "setError",
          error: err?.error.message ?? "Could not delete the card. Please try again.",
        });
        dispatch({ type: "setDeleting", value: false });
        return;
      }

      onDeleted(card.id);
      onOpenChange(false);
    } catch {
      dispatch({
        type: "setError",
        error: "Could not delete the card. Please try again.",
      });
      dispatch({ type: "setDeleting", value: false });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete card</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>Are you sure you want to delete this card?</p>
            <p className="rounded bg-white/5 p-2 text-sm">
              <span className="font-medium">{card.front}</span>
              <br />
              <span className="text-muted-foreground">{card.back}</span>
            </p>
            {state.deleteError && <p className="text-destructive text-sm">{state.deleteError}</p>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3">
          <AlertDialogCancel disabled={state.isDeleting}>Cancel</AlertDialogCancel>
          <button
            onClick={handleConfirm}
            disabled={state.isDeleting}
            className="border-input bg-destructive ring-offset-background hover:bg-destructive/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.isDeleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Delete
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
