import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { BootScreen, FullMessage } from "@/components/nc/boot";
import { Messenger } from "@/components/nc/shell";
import { Onboarding } from "@/components/nc/onboarding";
import { getMe } from "@/lib/numberchat/api";
import { errorText } from "@/lib/numberchat/share";
import type { AppSearch, Profile } from "@/lib/numberchat/types";
import { queryClient } from "@/lib/query-client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function NumberChatApp({
  search,
  go,
}: {
  search: AppSearch;
  go: (search: AppSearch) => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => getMe(),
    enabled: Boolean(user),
  });

  if (isPending || (user && me.isLoading)) return <BootScreen />;
  if (!user) return <Navigate to="/login" />;
  if (me.isError) {
    return (
      <FullMessage
        title="Couldn't open NumberChat"
        body={errorText(me.error, "Check your connection and try again.")}
        action="Try again"
        onAction={() => void me.refetch()}
      />
    );
  }
  if (!me.data) {
    return (
      <Onboarding
        onReady={(profile: Profile) => {
          queryClient.setQueryData(["me", user.id], profile);
        }}
      />
    );
  }
  return <Messenger profile={me.data} search={search} go={go} />;
}
