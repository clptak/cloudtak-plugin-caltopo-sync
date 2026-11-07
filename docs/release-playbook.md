# Release playbook – rolling out a new CalTopo ETL or plugin version

Use this when there is a new **etl-caltopo** version (e.g. `5.19.1`) or a plugin update, and
both CloudTAKs need it. Do the steps in order. Each step says how to check it worked before
you go on.

## The two CloudTAKs

| | clpdevtak | ccsosar |
|---|---|---|
| CloudTAK site | https://map.clpdevtak.com | https://cloudtak.ccsosar.net |
| AWS account | **Dev** – 1314-7077-3375 | **sarnet** – 1363-5159-5202 |
| AWS sign-in email (root) | `paul.clifton@clptak.com` | `clifton.paul@gmail.com` (with MFA) |
| Terminal profile | `ccso` | `ccsosar` |
| Image store (ECR) | `tak-vpc-ccso-dev-cloudtak-tasks` | `tak-vpc-ccsosar-cloudtak-tasks` |
| CalTopo Layers | Layer 5 | Layers 1 and 3 |

Each CloudTAK runs its Layers in **its own** AWS account, so a new ETL version is pushed to
both accounts.

---

## Part 1 – Sign in to AWS (on your Mac)

Do this for each account you are pushing to. A sign-in lasts several hours.

1. In your web browser, go to **https://console.aws.amazon.com**.
2. Click your account name at the **top right of that page** (black bar, with a ▾). The menu
   shows the account you're in (Account ID).
3. If the account you need isn't signed in yet: in that menu click **Add session** → **Root
   user** → its email from the table above → password → MFA code if asked. Forgot the
   password? Click **Forgot password** on that page; AWS emails a reset link.
4. In **Terminal**:
   ```bash
   aws login --profile ccso
   ```
   or, for ccsosar:
   ```bash
   aws login --profile ccsosar
   ```
   If it asks which session to use, pick the account matching the profile.
   **If it asks to overwrite the profile with a different account number, answer `n`** – your
   browser is signed in to the wrong account. Go back to step 2.

✅ **Check:** the terminal says you're logged in.

> "Switch role" doesn't appear in the menu when you're signed in as root – that's normal, use
> **Add session**.

---

## Part 2 – Build and push the ETL image (on your Mac)

Skip this part for a plugin-only update.

1. In Terminal, go to the ETL and make sure you're on the version you mean to release:
   ```bash
   cd ~/dev/etl-caltopo
   ```
   ```bash
   git log --oneline -1
   ```
   ```bash
   grep '"version"' package.json
   ```
2. Push to **clpdevtak** (takes about 5 minutes – leave it running):
   ```bash
   AWS_PROFILE=ccso AWS_REGION=us-east-1 AWS_ACCOUNT_ID=131470773375 Environment=ccso-dev npx cloudtak-etl
   ```
3. Push to **ccsosar** (another 5 minutes):
   ```bash
   AWS_PROFILE=ccsosar AWS_REGION=us-east-1 AWS_ACCOUNT_ID=136351595202 Environment=ccsosar npx cloudtak-etl
   ```

✅ **Check:** each run ends with lines like
`pushing manifest for …tak-vpc-…-cloudtak-tasks:etl-caltopo-v5.19.1 … done` and `DONE`.
If it ends with an error mentioning `expired` or `credentials`, redo Part 1 for that account
and run the command again.

---

## Part 3 – Update each CalTopo Layer (in CloudTAK, as admin)

Do this on **every** CalTopo Layer on **both** CloudTAKs (see the table). A Layer keeps
running its old version until its stack is redeployed.

1. CloudTAK → **Admin** → **Connections** → the Caltopo Connection → the Layer.
2. Click **Deployment** on the left.
3. Change the **Task** version to the new one, e.g. `etl-caltopo-v5.19.1`. CloudTAK may show a
   **Permissions Requested** list – keep everything that's ticked.
4. **Redeploy** the stack. Changing the version alone does nothing.
5. Wait until the deployment status shows `UPDATE_COMPLETE` (a few minutes).

✅ **Check:** two minutes later, open the same Layer → **Deployment** → **Layer Runtime
Logs**. The newest lines should include
`ok - sync … -> <map>: … linked` and `ok - CalTopo -> TAK: sent N CalTopo objects`, with no
`not ok` lines after the redeploy.

---

## Part 4 – Update the plugin (on each VPS)

1. Connect to the VPS (SSH) and go to the plugin:
   ```bash
   cd ~/tak-stack/CloudTAK/app/plugins/caltopo-sync
   ```
   ```bash
   git pull
   ```
2. Rebuild CloudTAK with the tak-stack update script, one command at a time:
   ```bash
   ~/tak-stack/cloudtak-update.sh check
   ```
   ```bash
   ~/tak-stack/cloudtak-update.sh prepare -y --rebuild
   ```
   ```bash
   ~/tak-stack/cloudtak-update.sh restart -y
   ```
   A plugin update leaves the CloudTAK version the same, so `prepare` needs `--rebuild` –
   without it nothing is rebuilt. Leave `--rebuild` off only when `check` reports a new
   CloudTAK version. (The tak-stack services start in a set order – always use this script,
   never a blanket `docker compose up -d`.)
3. On every computer that uses CloudTAK: **close all CloudTAK tabs**, then open it again.
   Browsers keep the old version until every tab is closed. Still old? Open it in a private
   window to confirm, then clear the site's data in the browser settings.

✅ **Check:** open **Caltopo Sync** in CloudTAK. Every pair row shows a Mission **name** (not a
long code), and the status badge has refreshed within a minute.

---

## Part 5 – Final check, per CloudTAK

Open **Caltopo Sync** → **CloudTAK ETL Pairs**:

| You see | Meaning | Do |
|---|---|---|
| **OK** (green) | Working both ways. | Nothing. ✅ |
| Yellow **CalTopo → TAK not connected** + **Fix** | The Layer has no Data Sync. | Click **Fix**, confirm. |
| **Items Missing** (orange) + a list | Those CalTopo objects can't go into TAK. | Fix them in CalTopo as the list says. |
| **Error** (red) + a red line | The last run failed. | See the [guide's common errors](./cloudtak-etl-guide.md#reading-the-pair-list). |
| **Not Running** | No run for 5 minutes. | Check Part 3 finished (`UPDATE_COMPLETE`). |

Then do one real test: draw a marker in the paired CalTopo map. Within two minutes it should
appear in the TAK Mission.

---

## Rules that still apply

- **Never delete a Data Sync, and never turn its Mission Sync off** – that deletes the Mission.
- **Never paste AWS keys, CalTopo secrets or CloudTAK tokens** into chat, email or a ticket.
- Don't run two Layers – on either CloudTAK – on the **same Mission**.
