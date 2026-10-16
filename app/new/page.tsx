import { Suspense } from "react";
import Link from "next/link";
import NewProjectForm from "@/components/NewProjectForm";
import { currentUser } from "@/lib/auth";

async function Form() {
  const user = await currentUser();
  return <NewProjectForm defaultEmail={user?.email ?? ""} />;
}

export default function NewProjectPage() {
  return (
    <main className="wrap">
      <div className="top">
        <div>
          <h1>Create a project</h1>
          <p className="muted">Upload your documents and add your team. The agent does the setup.</p>
        </div>
        <Link className="link" href="/">Back to my project</Link>
      </div>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}
