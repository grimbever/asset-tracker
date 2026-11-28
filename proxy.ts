import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionNeedsRefresh } from "@/lib/supabase/session";
import { supabasePublicConfig } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  try {
    const config = supabasePublicConfig();
    if (!config) return NextResponse.next({ request });
    if (!sessionNeedsRefresh(request.cookies.getAll(), Date.now())) {
      return NextResponse.next({ request });
    }

    let response = NextResponse.next({ request });
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabase.auth.getUser();
    return response;
  } catch {
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|manifest.webmanifest|robots.txt|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|webmanifest|woff2?)$).*)",
  ],
};
