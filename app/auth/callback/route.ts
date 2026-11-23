import { NextResponse } from "next/server";
import { planAuthCallback } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const plan = planAuthCallback(url);
  const supabase = await createSupabaseServerClient();
  if (supabase && plan.action === "exchange") {
    const { error } = await supabase.auth.exchangeCodeForSession(plan.code);
    if (error) return NextResponse.redirect(new URL("/sign-in", url.origin));
  }
  if (supabase && plan.action === "verify") {
    const { error } = await supabase.auth.verifyOtp({
      type: plan.type,
      token_hash: plan.tokenHash,
    });
    if (error) return NextResponse.redirect(new URL("/sign-in", url.origin));
  }
  return NextResponse.redirect(new URL(plan.next, url.origin));
}
