# Kharcha — my private expense tracker

A small web app that reads **bank debit SMS** and keeps track of spending.
It needs **no Apple Developer account and no server**. Your data stays **only on your phone**, and you can back it up as CSV.

## What it does
- Reads bank SMS that mention money going out (`debited`, `sent`, `spent`, `withdrawn`, …). It works no matter which app you paid with (GPay, CRED, super.money, PhonePe, card or AutoPay), because the **bank** sends the SMS.
- Skips credits, OTPs and "will be debited" reminders, and ignores duplicates.
- Fills in the category from the shop name: Food, Shopping, Travel, Bills, Investment, Rent or Others.
- Unknown shops go to a **Review** tab. You pick a category once and the app remembers that shop.
- Shows totals for today and the month, a bar for each day, and a breakdown by category.
- Lets you edit or delete any payment and add cash spending by hand.
- Exports and imports CSV.

## 1. Put it online (free, GitHub Pages)
1. Create a new GitHub repo (it can be **private** if you have GitHub Pro; otherwise public is fine, because **no money data is ever stored in the repo**).
2. Upload everything in this folder: `index.html`, `manifest.json`, `sw.js` and `icons/`.
3. Go to the repo's **Settings → Pages → Branch: main → / (root) → Save**.
4. After about a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

## 2. Install it on your iPhone
1. Open that link in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. From now on, always open it from the **home-screen icon**. The home-screen app has its own storage, separate from Safari tabs.

## 3. Make the iPhone save bank SMS automatically (Shortcuts)
This runs silently each time a debit SMS arrives:

1. Open the **Shortcuts** app, go to the **Automation** tab and tap **+**.
2. Choose **Message**.
   - **Message Contains:** `debited`
   - (Optional) **Sender:** pick your bank's sender ID.
   - Select **Run Immediately** and turn off **Notify When Run**. Tap **Next**.
3. Tap **New Blank Automation** and add these actions:
   1. **Text**. Inside it, insert the variable **Shortcut Input → Content**, press return, then type `---`.
   2. **Append to Text File**. Set it to append the **Text** from step 1. Leave the folder as **Shortcuts** and type the file path `kharcha-inbox.txt` (just the name, the folder is already Shortcuts). Turn **Make New Line** on.
4. Tap **Done**.

> Some banks say "Sent Rs…" or "spent" instead of "debited". Make a second automation with **Message Contains: `Sent Rs`** (and one for `spent` if needed) using the same actions.

**To bring payments into the app:** open Kharcha, go to **Add → Choose inbox file**, then **iCloud Drive → Shortcuts → kharcha-inbox.txt**.
Messages already added are skipped, so you can pick the same file every time.

## 4. Backup
Go to **Add → Export CSV** and save the file to Files or iCloud. Use **Import CSV** to restore it on a new phone.
Export a backup every now and then. If the app is deleted from the home screen, its data is deleted too.

## Changing categories / keywords
Edit the `KEYWORDS` list near the top of the `<script>` in `index.html`.
