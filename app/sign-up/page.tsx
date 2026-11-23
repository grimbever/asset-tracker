import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function SignUpPage() {
  return (
    <Suspense fallback={<main className="px-4 py-10">Loading…</main>}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
