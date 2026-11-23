import { SetupScreen } from "@/components/setup/SetupScreen";
import { supabaseEnvProblem } from "@/lib/supabase/env";

export default function SetupPage() {
  return <SetupScreen problem={supabaseEnvProblem()} />;
}
