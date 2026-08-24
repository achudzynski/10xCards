export interface Card {
  id: string;
  userId: string;
  front: string;
  back: string;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedCard {
  front: string;
  back: string;
}

export interface GenerateRequest {
  text: string;
}

export interface GenerateResponse {
  cards: GeneratedCard[];
}

export interface CreateCardRequest {
  front: string;
  back: string;
  isAiGenerated?: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    context?: unknown;
  };
}
