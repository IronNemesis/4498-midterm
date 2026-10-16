import { Suspense } from "react";
import NewProjectForm from "@/components/NewProjectForm";
import Shell from "@/components/Shell";
import { currentUser } from "@/lib/auth";

async function Form() {
  const user = await currentUser();
  return <NewProjectForm defaultEmail={user?.email ?? ""} />;
}

export default function NewProjectPage() {
  return (
    <Shell>
      <div className="page">
        <div className="cover" />
        <div className="page-icon">+</div>
        <h1 className="page-title">New project</h1>
        <p className="page-sub">Drop in your assignment and add your team. The agent reads it, sets everything up, and drafts a plan you can approve.</p>
        <Suspense fallback={<div className="skeleton" style={{ marginTop: "2rem" }} />}>
          <Form />
        </Suspense>
      </div>
    </Shell>
  );
}
