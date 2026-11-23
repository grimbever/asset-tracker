import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="px-4 py-10">Loading sign-in…</main>}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
