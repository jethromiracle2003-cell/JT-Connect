import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, UserRound } from "lucide-react";
import { Mark } from "@/components/nc/bits";
import { ChatsPane } from "@/components/nc/chats";
import { ContactsPane } from "@/components/nc/contacts";
import { SettingsPane } from "@/components/nc/settings";
import { ThreadPane } from "@/components/nc/thread";
import { usePageVisible } from "@/components/nc/use-visible";
import { heartbeat, listChats } from "@/lib/numberchat/api";
import { formatNumber } from "@/lib/numberchat/format";
import type { AppSearch, Profile, TabId } from "@/lib/numberchat/types";

const tabs: { id: TabId; label: string; icon: typeof MessageCircle }[] = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "contacts", label: "Contacts", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Messenger({
  profile,
  search,
  go,
}: {
  profile: Profile;
  search: AppSearch;
  go: (search: AppSearch) => void;
}) {
  const visible = usePageVisible();
  const chats = useQuery({
    queryKey: ["chats"],
    queryFn: () => listChats(),
    refetchInterval: visible ? 2500 : 10000,
  });
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const beat = () => {
      void heartbeat().catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!chats.data) return;
    const inbox = chats.data.filter(
      (chat) => chat.requestStatus === "accepted" && !chat.archived && !chat.muted,
    );
    const total = inbox.reduce((sum, chat) => sum + chat.unread, 0);
    if (
      seen.current != null &&
      total > seen.current &&
      document.hidden &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      let enabled = false;
      try {
        enabled = localStorage.getItem("nc-notify") === "on";
      } catch {
        enabled = false;
      }
      if (enabled) {
        const latest = chats.data.find(
          (chat) =>
            chat.unread > 0 && chat.requestStatus === "accepted" && !chat.archived && !chat.muted,
        );
        if (latest) {
          try {
            new Notification(latest.title, { body: latest.preview });
          } catch {
            /* notifications can throw if the page is not allowed */
          }
        }
      }
    }
    seen.current = total;
  }, [chats.data]);

  const open = Boolean(search.c);
  const unread = (chats.data ?? [])
    .filter((chat) => chat.requestStatus === "accepted" && !chat.archived)
    .reduce((sum, chat) => sum + chat.unread, 0);

  return (
    <div className="flex h-full">
      <aside
        className={`flex w-full min-w-0 flex-col border-line md:w-96 md:shrink-0 md:border-r ${
          open ? "hidden md:flex" : "flex"
        }`}
      >
        {search.tab === "chats" ? (
          <ChatsPane
            profile={profile}
            chats={chats.data}
            loading={chats.isLoading}
            error={chats.isError}
            onRetry={() => void chats.refetch()}
            activeId={search.c}
            go={go}
          />
        ) : null}
        {search.tab === "contacts" ? <ContactsPane go={go} /> : null}
        {search.tab === "settings" ? <SettingsPane profile={profile} /> : null}
        <nav className="grid grid-cols-3 border-t border-line bg-surface pb-safe" aria-label="Primary">
          {tabs.map((tab) => {
            const active = search.tab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium"
                onClick={() => go({ tab: tab.id })}
              >
                <span
                  className={`relative grid size-8 place-items-center rounded-full ${
                    active ? "bg-accent text-accent-fg" : "text-muted"
                  }`}
                >
                  <Icon className="size-5" />
                  {tab.id === "chats" && unread > 0 ? (
                    <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-fg px-1 text-xs font-semibold text-bg tabular-nums">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </span>
                <span className={active ? "text-fg" : "text-muted"}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className={`relative min-w-0 flex-1 ${open ? "flex" : "hidden md:flex"}`}>
        {search.c ? (
          <ThreadPane conversationId={search.c} meId={profile.userId} go={go} />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center px-8 text-center md:flex">
            <Mark className="size-16" />
            <h2 className="mt-5 text-xl font-semibold text-balance">Your line is open</h2>
            <p className="mt-2 max-w-sm text-sm text-pretty text-muted">
              Pick a conversation, or share {formatNumber(profile.number)} so someone new can find you.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
