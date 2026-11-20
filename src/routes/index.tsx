import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NumberChatApp } from "@/components/nc/app";
import { BootScreen } from "@/components/nc/boot";
import type { AppSearch } from "@/lib/numberchat/types";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): AppSearch => {
    const tab = search.tab === "contacts" || search.tab === "settings" ? search.tab : "chats";
    const conversation =
      typeof search.c === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(search.c) ? search.c : undefined;
    return conversation ? { tab, c: conversation } : { tab };
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <BootScreen />;
  return (
    <NumberChatApp
      search={search}
      go={(next) => {
        void navigate({ to: "/", search: next });
      }}
    />
  );
}
