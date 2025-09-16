import { Suspense } from "react";
import PlayClient from "./PlayClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading game…</div>}>
      <PlayClient />
    </Suspense>
  );
}

