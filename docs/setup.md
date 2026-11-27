# Set up Asset Tracker

This is the click-by-click setup for the first version. You do not need the Supabase command-line tools. You paste one SQL file, then connect the app on Vercel.

The product name is still a working title. It lives in one file, `lib/config.ts`. Leave that file alone unless you want to rename the app.

## 1. Create the Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**.
3. Pick an organization, name the project (for example `asset-tracker`), set a database password, and save that password somewhere safe.
4. Choose a region close to Iowa if one is offered. Otherwise the US East region is fine.
5. Wait until the project status says it is ready. This can take a minute.

## 2. Paste the database setup

1. In the Supabase project, open **SQL Editor**.
2. Click **New query**.
3. On your computer, open `supabase/setup.sql` from this repo. Select the entire file and copy it.
4. Paste it into the SQL Editor.
5. Click **Run**.

The run should finish without errors. It creates the tables, the security rules, the photo bucket, and the plan records.

If an earlier paste stopped with an error, paste this whole file again and run it. That second run finishes the missing pieces and does not erase anything already created.

Running the file again is safe. It fills in anything missing and does not erase equipment you have already added.

You do not need to run anything else. The files in `supabase/migrations` are the same schema, kept for later if a developer uses the Supabase tools.

## 3. Turn on email sign-in

1. In Supabase, open **Authentication**, then **Providers**, and make sure **Email** is enabled.
2. For the first setup, you can turn **Confirm email** off under **Authentication** → **Sign In / Providers** → **Email**. That lets you create the organization immediately. You can turn confirmation back on later.
3. Open **Authentication** → **URL Configuration**.
4. Set **Site URL** to the address you will actually use. For a first Vercel deploy that is usually `https://your-project.vercel.app`. For trying it on your own computer, use `http://localhost:3000`.
5. Under **Redirect URLs**, add each of these (use your real Vercel names):

   - `http://localhost:3000/**`
   - `https://your-project.vercel.app/**`
   - `https://*-your-team.vercel.app/**`

   The last one lets preview deployments send you back to the right site. Supabase accepts the `*` wildcard.

Password reset and magic-link emails come from Supabase. Invite links are created in the app and you send them yourself (the app opens a draft in your email program). This version does not use a separate email service.

## 4. Copy the API keys

1. In Supabase, open **Project Settings** → **API** (sometimes labeled **Data API**).
2. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`. A host without `https://`, or a URL ending in `/rest/v1`, is accepted. Do not paste the anon key or the publishable key into this field. If the value is not a web address, the site shows a setup screen that names `NEXT_PUBLIC_SUPABASE_URL` instead of crashing.
3. Copy the **publishable** key if you see one (`sb_publishable_...`). If the page only shows a **anon** **public** key, copy that instead. You only need one of them.

Do not put the **service_role** key in the public site settings. This version does not need it.

## 5. Put the app on Vercel

1. Push this repo to GitHub if it is not there already.
2. Go to [https://vercel.com/new](https://vercel.com/new) and import the GitHub repo.
3. Framework preset: **Next.js**. Leave the build command as `next build`.
4. Before you deploy, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | The project URL from step 4 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key, if you have one |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon key, if you do not have a publishable key. You can set both. If both are set, the publishable key is used. |
   | `NEXT_PUBLIC_SITE_URL` | The production site address, such as `https://your-project.vercel.app`, with no slash at the end. |
   | `RESEND_API_KEY` | Optional. From [Resend](https://resend.com). Leave blank and notification email is skipped. |
   | `NOTIFY_FROM` | Optional. A sender on a domain you verified in Resend, such as `Asset Tracker <assets@yourdomain.com>`. |

5. Set `NEXT_PUBLIC_SITE_URL` for **Production** only. Leave it empty on Preview. Preview deployments then use their own address for sign-in links.
6. Deploy.

If those variables are missing, the site still opens. It shows a setup screen instead of an error.

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are optional. Set both on Vercel if you want the daily subscription reminder. Leave them blank and the reminder job skips without an error. The service role key must never be a `NEXT_PUBLIC_` variable.

### If the database already exists

Paste `supabase/setup.sql` into the SQL Editor and run it again. That adds statuses, types, custom fields, archive columns, the super-user permission, the history search, the invite-email history entry, and subscriptions. It also fills in the person on older check-out and check-in rows, lets a signed-in member run that search, archives the Retired status, and marks any Retired item Disposed with a history note. It does not erase equipment, people, invites, or subscriptions. Invite emails and subscription reminders use the same `RESEND_API_KEY` and `NOTIFY_FROM` settings as status alerts. If those are empty, the invite link is still shown to copy and reminder email is skipped.

### Auth email through Resend

Supabase’s built-in mail sender is easy to hit a rate limit on. To send signup and password mail through Resend:

1. In Resend, verify the domain you will send from.
2. In Supabase, open **Authentication** → **Emails** → **SMTP Settings** and turn on a custom SMTP server.
3. Host `smtp.resend.com`, port `465`, username `resend`, password your Resend API key.
4. Sender email and name must match a verified Resend sender.

Check-out, check-in, and status emails use `RESEND_API_KEY` and `NOTIFY_FROM` in Vercel. They are separate from the Supabase SMTP setting. With those two variables empty, the app writes a log line and does not send.

## 6. Try it on your computer (optional)

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with the same names as the table above. For local use you can leave `NEXT_PUBLIC_SITE_URL` empty.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 7. Create your organization and the sample gear

1. Open the site and choose **Create an organization**.
2. Enter your name, the organization name, and leave the timezone on `America/Chicago` unless you want another clock.
3. Use your email and a password of at least 8 characters.
4. After you are in, the home page offers **Load sample equipment** when the register is empty. That adds:
   - a 16 ft equipment trailer
   - an impact driver
   - a PAA dosing skid, checked out as a kit with its feed pump
   - locations named Shop, Yard, and Storeroom
   - a sample person, Pat (demo)

   The plate and VIN on the trailer are fake.

5. Open the impact driver, choose **Check out**, pick **Pat (demo)** or **Me**, and confirm. **Check in** is one tap. You can skip the damage question.

## 8. Print a label

1. Open **Labels**.
2. Leave the paper on **Avery 5163** unless you have a different sheet or roll. Brother, Dymo, Zebra, and a custom size are in the same list.
3. Select the items and choose **Print**.
4. In the browser print dialog, pick **Save as PDF** or the printer you already use. Load that paper or roll. This app does not install a printer driver.

Each QR code opens that asset, for example `https://your-site/a/AT-1001`, after you sign in.

## 9. Phone

1. On the phone browser, open the site and sign in.
2. Use the browser menu and choose **Add to Home Screen** (or **Install app**). That adds an icon. The app still needs a connection. Offline sync is not built.
3. Open **Scan**, allow the camera, and point it at a label. You can also type the tag, or use a USB scanner in the search box on a computer.

## Invite someone

1. Open **Settings**.
2. Under **Invite by email**, enter their email and a role (Admin, Manager, Editor, Requester, or Viewer).
3. Create the link and use **Open an email with this link**, or copy the link and send it yourself.
4. They open the link, create an account with that same email, and accept.

Field Tech and Auditor are listed as not available yet. The storeroom kiosk, supplies, work orders, and approvals are in the database and are not on screen in this version.

## What the checks do

From the project folder:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

GitHub runs the same four checks on every push.
