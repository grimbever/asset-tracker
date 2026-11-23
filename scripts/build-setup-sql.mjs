import { readFileSync, writeFileSync } from "node:fs";

const body = readFileSync("supabase/migrations/20261123000000_init.sql", "utf8");
const header = `-- Asset Tracker setup
-- Paste this whole file into the Supabase SQL Editor once.
-- Running it again is safe: it creates anything that is missing and does not erase equipment, people, or photos.
-- You do not need the Supabase CLI. You do not need to be a developer.

`;

writeFileSync("supabase/setup.sql", `${header}${body}`);
console.log("wrote supabase/setup.sql");
