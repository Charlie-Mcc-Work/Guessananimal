// app/play/page.tsx
import { Suspense } from "react";
import PlayClient from "./PlayClient";

// Prevent static prerendering / CSR bailout on Vercel
export const dynamic = "force-dynamic"; // or: export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading game…</div>}>
      <PlayClient />
    </Suspense>
  );
}

