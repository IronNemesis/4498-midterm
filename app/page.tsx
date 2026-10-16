import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";
import Shell from "@/components/Shell";

function Loading() {
  return (
    <div className="page">
      <div className="cover" />
      <div className="page-icon">TT</div>
      <div style={{ maxWidth: 420, marginTop: "1.5rem" }}>
        <div className="skeleton" style={{ height: 28, width: "70%" }} />
        <div className="skeleton" />
        <div className="skeleton" style={{ width: "55%" }} />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </Shell>
  );
}
