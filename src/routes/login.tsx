import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BootScreen } from "@/components/nc/boot";
import { Welcome } from "@/components/nc/welcome";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || isPending) return <BootScreen />;
  if (user) return <Navigate to="/" search={{ tab: "chats" }} />;
  return <Welcome />;
}
