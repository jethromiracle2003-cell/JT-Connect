import { create } from "zustand";

export type PendingMessage = {
  id: string;
  conversationId: string;
  kind: "text" | "image" | "voice";
  body: string | null;
  media: string | null;
  replyTo: string | null;
  replyPreview: string | null;
  replyName: string | null;
  createdAt: string;
  status: "sending" | "failed";
};

type Store = {
  pending: PendingMessage[];
  add: (message: PendingMessage) => void;
  patch: (id: string, partial: Partial<PendingMessage>) => void;
  drop: (id: string) => void;
};

export const usePending = create<Store>((set) => ({
  pending: [],
  add: (message) => set((state) => ({ pending: [...state.pending, message] })),
  patch: (id, partial) =>
    set((state) => ({
      pending: state.pending.map((message) =>
        message.id === id ? { ...message, ...partial } : message,
      ),
    })),
  drop: (id) => set((state) => ({ pending: state.pending.filter((message) => message.id !== id) })),
}));
