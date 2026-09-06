import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card as UiCard, CardContent } from "@/components/ui/card";
import CardFormDialog from "@/components/deck/CardFormDialog";
import DeleteCardDialog from "@/components/deck/DeleteCardDialog";
import type { Card } from "@/types";

interface DeckViewProps {
  initialCards: Card[];
}

type DialogState = "closed" | "create" | "edit" | "delete";

export default function DeckView({ initialCards }: DeckViewProps) {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [dialogState, setDialogState] = useState<DialogState>("closed");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  function handleOpenCreate() {
    setSelectedCard(null);
    setDialogState("create");
  }

  function handleOpenEdit(card: Card) {
    setSelectedCard(card);
    setDialogState("edit");
  }

  function handleOpenDelete(card: Card) {
    setSelectedCard(card);
    setDialogState("delete");
  }

  function handleFormSaved(card: Card) {
    setCards((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === card.id);
      if (existingIndex >= 0) {
        // Edit: replace in place
        const updated = [...prev];
        updated[existingIndex] = card;
        return updated;
      }
      // Create: prepend to list
      return [card, ...prev];
    });
    setDialogState("closed");
  }

  function handleDeleted(cardId: string) {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setDialogState("closed");
  }

  function handleCloseDialog() {
    setDialogState("closed");
    setSelectedCard(null);
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center text-white backdrop-blur-xl">
        <p className="text-blue-100/80">Your deck is empty.</p>
        <p className="mt-4 text-sm text-blue-100/50">
          Create your first card manually or head to{" "}
          <a href="/generate" className="underline hover:text-white">
            Generate
          </a>{" "}
          to create cards from text.
        </p>
        <Button onClick={handleOpenCreate} className="mt-6">
          <Plus className="mr-2 size-4" />
          Add card
        </Button>

        <CardFormDialog open={dialogState === "create"} onOpenChange={handleCloseDialog} onSaved={handleFormSaved} />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 size-4" />
          Add card
        </Button>
      </div>

      <ul className="space-y-4">
        {cards.map((card) => (
          <li key={card.id}>
            <UiCard>
              <CardContent className="flex items-start justify-between pt-6">
                <div className="flex-1">
                  <p className="font-semibold">{card.front}</p>
                  <p className="text-muted-foreground mt-2">{card.back}</p>
                </div>
                <div className="ml-4 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleOpenEdit(card);
                    }}
                    aria-label="Edit card"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleOpenDelete(card);
                    }}
                    aria-label="Delete card"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </UiCard>
          </li>
        ))}
      </ul>

      <CardFormDialog
        open={dialogState === "create" || dialogState === "edit"}
        onOpenChange={handleCloseDialog}
        card={dialogState === "edit" ? (selectedCard ?? undefined) : undefined}
        onSaved={handleFormSaved}
      />

      {selectedCard && (
        <DeleteCardDialog
          open={dialogState === "delete"}
          onOpenChange={handleCloseDialog}
          card={selectedCard}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
