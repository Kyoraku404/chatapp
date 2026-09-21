"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { InlineError } from "@/components/chat/States";

// Invite landing: /join?space=<id>&code=<code> redeems via the Admin API
// (atomic, idempotent) then jumps into the space's first channel.
function JoinFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const spaceId = params.get("space");
    const code = params.get("code");
    if (!spaceId || !code) {
      setError("This invite link is incomplete (space or code missing).");
      setBusy(false);
      return;
    }
    void fetch("/api/invites/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId, code }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || "Could not join space.");
        router.replace(`/app?space=${encodeURIComponent(spaceId)}`);
      })
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  }, [params, router]);

  return (
    <div className="w-full max-w-sm rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-card">
      <BrandMark />
      {busy && !error && <p className="mt-4 text-sm text-ink-500">Joining space…</p>}
      {error && (
        <>
          <h1 className="font-display mt-4 text-xl font-bold">Couldn&apos;t join</h1>
          <div className="mt-3">
            <InlineError message={error} />
          </div>
          <Link href="/app" className="mt-4 inline-block rounded-2xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white">
            Open RUSH
          </Link>
        </>
      )}
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <Suspense fallback={<p className="text-sm text-ink-500">Loading…</p>}>
        <JoinFlow />
      </Suspense>
    </div>
  );
}
