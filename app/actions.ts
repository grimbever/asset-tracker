"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function selectOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/setup");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!membership) redirect("/home");
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/home");
}
