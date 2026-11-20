import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/nc/bits";
import { formatNumber } from "@/lib/numberchat/format";
import { copyNumber, shareNumber } from "@/lib/numberchat/share";

export function ShareCard({ name, number }: { name: string; number: string }) {
  const [markup, setMarkup] = useState("");

  useEffect(() => {
    let alive = true;
    void import("qrcode")
      .then((mod) =>
        mod.default.toString(number, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      )
      .then((svg) => {
        if (!alive) return;
        setMarkup(
          svg
            .replace(/fill="#000000"/g, 'fill="currentColor"')
            .replace(/fill="#ffffff"/g, 'fill="none"'),
        );
      })
      .catch(() => {
        if (alive) setMarkup("");
      });
    return () => {
      alive = false;
    };
  }, [number]);

  return (
    <div className="rounded-3xl bg-surface-2 p-5 text-center">
      <p className="text-sm text-muted">NumberChat line</p>
      <p className="mt-1 text-lg font-semibold">{name}</p>
      <p className="mt-2 text-3xl font-semibold tracking-wide tabular-nums">{formatNumber(number)}</p>
      <div
        className="mx-auto mt-5 grid size-52 place-items-center rounded-2xl bg-bg text-fg"
        aria-label={`QR code for ${formatNumber(number)}`}
      >
        {markup ? (
          <div className="size-44" dangerouslySetInnerHTML={{ __html: markup }} />
        ) : (
          <p className="text-sm text-muted">Preparing code…</p>
        )}
      </div>
      <p className="mt-4 text-sm text-pretty text-muted">
        Scan the code or share the number. It isn't a phone number.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={() => void copyNumber(number)}>
          <Copy className="size-4" />
          Copy
        </Button>
        <Button variant="ghost" onClick={() => void shareNumber(number)}>
          <Share2 className="size-4" />
          Share
        </Button>
      </div>
    </div>
  );
}
