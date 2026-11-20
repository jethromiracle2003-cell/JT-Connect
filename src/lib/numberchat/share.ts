import { toast } from "sonner";
import { formatNumber } from "@/lib/numberchat/format";

export async function copyNumber(number: string) {
  try {
    await navigator.clipboard.writeText(number);
    toast.success("Number copied");
  } catch {
    toast.error("Couldn't copy that number");
  }
}

export async function shareNumber(number: string) {
  const text = `Message me on NumberChat. My number is ${formatNumber(number)}.`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "NumberChat", text });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }
  await copyNumber(number);
}

export function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
