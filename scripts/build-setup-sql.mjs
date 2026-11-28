import { readFileSync, writeFileSync } from "node:fs";

const init = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
const milestone2 = readFileSync("supabase/migrations/20261124000000_milestone2.sql", "utf8");
const history = readFileSync("supabase/migrations/20261125000000_history_links.sql", "utf8");
const inviteSent = readFileSync("supabase/migrations/20261127000000_invite_sent.sql", "utf8");
const statusChange = readFileSync("supabase/migrations/20261127000000_status_change.sql", "utf8");
const historyLabels = readFileSync("supabase/migrations/20261128000000_history_labels.sql", "utf8");
const subscriptions = readFileSync("supabase/migrations/20261129000000_subscriptions.sql", "utf8");
const companySetup = readFileSync("supabase/migrations/20261130000000_company_setup.sql", "utf8");
const performance = readFileSync("supabase/migrations/20261130120000_performance.sql", "utf8");
const header = `-- Asset Tracker setup
-- Paste this whole file into the Supabase SQL Editor once.
-- Running it again is safe: it creates anything that is missing and does not erase equipment, people, or photos.
-- You do not need the Supabase CLI. You do not need to be a developer.

`;

writeFileSync(
  "supabase/setup.sql",
  `${header}${init}\n-- Milestone 2\n${milestone2}\n-- History links\n${history}\n-- Invite email\n${inviteSent}\n-- Status change\n${statusChange}\n-- History labels\n${historyLabels}\n-- Subscriptions\n${subscriptions}\n-- Company setup\n${companySetup}\n-- Performance\n${performance}`,
);
console.log("wrote supabase/setup.sql");
