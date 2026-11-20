import { differenceInMinutes, format, isToday, isYesterday } from "date-fns";

export function formatNumber(number: string) {
  if (number.length !== 10) return number;
  return `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
}

export function formatLastSeen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  const mins = differenceInMinutes(new Date(), date);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (isToday(date)) return `today at ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `yesterday at ${format(date, "h:mm a")}`;
  return format(date, "MMM d");
}

export function formatChatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days < 7) return format(date, "EEE");
  return format(date, "MMM d");
}

export function formatBubbleTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "h:mm a");
}

export function formatDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

export function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
