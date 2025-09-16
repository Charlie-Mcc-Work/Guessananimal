// app/play/page.tsx
import { Suspense } from "react";
import dynamic from "next/dynamic";

// Prevent static prerendering / CSR bailout issues on Vercel
export const dynamic = "force-dynamic"; // or: export const revalidate = 0;

// Option A: render client-only (no SSR of the game)
const PlayClient = dynamic(() => import("./PlayClient"), { ssr: false });

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading game…</div>}>
      <PlayClient />
    </Suspense>
  );
}

