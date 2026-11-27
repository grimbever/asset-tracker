import { readFileSync, writeFileSync } from "node:fs";

const init = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
const milestone2 = readFileSync("supabase/migrations/20261124000000_milestone2.sql", "utf8");
const history = readFileSync("supabase/migrations/20261125000000_history_links.sql", "utf8");
const inviteSent = readFileSync("supabase/migrations/20261127000000_invite_sent.sql", "utf8");
const header = `-- Asset Tracker setup
-- Paste this whole file into the Supabase SQL Editor once.
-- Running it again is safe: it creates anything that is missing and does not erase equipment, people, or photos.
-- You do not need the Supabase CLI. You do not need to be a developer.

`;

writeFileSync(
  "supabase/setup.sql",
  `${header}${init}\n-- Milestone 2\n${milestone2}\n-- History links\n${history}\n-- Invite email\n${inviteSent}`,
);
console.log("wrote supabase/setup.sql");
