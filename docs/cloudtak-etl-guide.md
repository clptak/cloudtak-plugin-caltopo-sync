# CloudTAK ETL for CalTopo – a guide for admins new to TAK

This guide explains the CloudTAK pieces behind a CalTopo ↔ TAK pair: what each one is, how
they fit together, and which buttons are safe. Read it before you touch **Admin →
Connections**. The step-by-step setup of a Connection's first pair is in the etl-caltopo repo,
`docs/ADMIN_PAIRING.md`.

## In plain English – start here

Think of it as a robot that copies things between a CalTopo map and a TAK Mission.

- **Connection = the robot's ID badge.** CloudTAK has a robot user that does automatic work on
  the TAK Server. The Connection is its login. Ours is called **Caltopo**.
- **Layer = the robot's job.** Every minute it copies changes between **one** CalTopo map and
  **one** TAK Mission. It works under its badge.
- **Data Sync = the robot's key to one Mission.** The robot can only put things *into* a
  Mission it has a key for, and keys are issued **per badge** – a key made under another
  Connection doesn't work for this robot, and doesn't even show in its list.

What that means in practice:

- **Use the plugin's + button for every pair.** It makes the job, makes (or reuses) the key and
  hands it to the robot – nobody needs to know any of this.
- **The first pair on a Connection is the only one built by hand**, and the one place the key
  gets forgotten. Without it the robot can still send TAK items to CalTopo, but nothing drawn in
  CalTopo – markers, lines or shapes – reaches the Mission. See
  [Nothing from CalTopo shows up in TAK](#nothing-from-caltopo-shows-up-in-tak).
- **Never take a key away** (delete a Data Sync or turn its Mission Sync off) – that deletes the
  Mission itself. See the two rules below.

## The two rules that can't be undone

1. **Never delete a Data Sync, and never turn its Mission Sync off.** CloudTAK then **deletes
   the TAK Mission on the TAK Server**, with everything in it.
2. **Deleting a Layer stops a pair for good.** The Mission and the CalTopo map keep their
   items, but you have to set the pair up again. To stop a pair for a while, turn the
   Layer's **Enabled** switch off instead.

## The words

| Word | What it is | Where you see it |
|---|---|---|
| **TAK Server** | The server that TAK clients (ATAK, iTAK, WinTAK, CloudTAK) share positions and data through. | Not in CloudTAK – it runs separately. |
| **CloudTAK** | The TAK client in a web browser – map.clpdevtak.com. It also runs the "ETL" jobs below. | The whole web app. |
| **Mission** | A shared folder on the TAK Server: markers, lines, shapes, files and logs for one incident or operational period. Everyone subscribed sees the same contents. | Map menu → **Data Sync** (the ambulance icon). |
| **CalTopo map** | The team's map on caltopo.com. Its ID is the part after `/m/` in the URL, e.g. `APJ7U0R`. | caltopo.com |
| **Pair** | One Mission and one CalTopo map kept in step with each other. | The plugin's **CloudTAK ETL Pairs** list. |
| **Connection** | A machine account CloudTAK uses to talk to the TAK Server – like a user, but for automated jobs. Its Layers and Data Syncs hang off it. | **Admin → Connections**. Ours is called **Caltopo**. |
| **Layer** | A small program attached to a Connection that runs on a schedule (every minute here) in AWS. **One Layer runs one pair.** It reads the CalTopo map and the Mission and copies the changes across. | Admin → Connections → Caltopo → **Layers**. |
| **Data Sync** (Connection) | The Connection's link to one Mission. The Layer writes into the Mission through it. | Admin → Connections → Caltopo → **Data Sync**. |
| **Task** | The program a Layer runs, with its version, e.g. `etl-caltopo-v5.18.1`. | Layer → **Deployment**. |
| **ETL** | "Extract, Transform, Load" – CloudTAK's name for these Layer programs. | |

### "Data Sync" means two things

CloudTAK uses the name for two different screens:

- **Map menu → Data Sync** lists the **Missions** you can subscribe to. This is what field users
  see. Creating one here makes a normal Mission – it does **not** pair anything.
- **Admin → Connections → Caltopo → Data Sync** lists the **Connection's links** to Missions.
  Each row points at one Mission. This is the one a pair needs, and the one rule 1 is about.

The same Mission shows up in both places. Deleting it from the Connection's list deletes the
Mission for everyone.

## How the pieces fit

```
                      Admin → Connections → "Caltopo"
                     ┌───────────────────────────────────────────────┐
  caltopo.com        │  Layer "CalTopo APJ7U0R"     Data Sync         │     TAK Server
 ┌──────────────┐    │  (runs every minute    ───►  "2026-08-05_..."  │───► ┌──────────────────┐
 │ map APJ7U0R  │◄──►│   in AWS, 256 MB)            (link to Mission) │     │ Mission          │
 └──────────────┘    └───────────────────────────────────────────────┘     │ "2026-08-05_..." │
                                                                           └──────────────────┘
```

- The **Layer** holds the pair's settings: the CalTopo map ID, the Mission, the CalTopo
  credentials and whether it is a dry run. It reaches the Mission through the **Data Sync**.
- CalTopo objects land in a Mission folder named after the Layer (e.g. `CalTopo APJ7U0R`), so
  **don't rename a Layer** after it is set up.
- **One Mission, one Layer.** Two Layers on the same Mission – even from another CloudTAK – keep
  deleting each other's items.

## Two ways to create a pair

| | Plugin (+ button) | By hand (ADMIN_PAIRING.md) |
|---|---|---|
| Who | A CloudTAK System Administrator | A CloudTAK System Administrator |
| When | Every pair **after the first** on a Connection | The **first** pair on a Connection, or when the plugin can't |
| Secrets | Copied from an existing CalTopo Layer – nobody types or sees them | Typed in once: CalTopo credential ID and secret, CloudTAK API token |

The plugin's **+** button only shows once the Connection has a CalTopo Layer **with a pair** to
copy from. A Layer with credentials but an empty `Pairs` list doesn't count – the plugin ignores it.
With none (for example after deleting them all), the list says **No ETL Pairs** and an admin first
sets up one complete pair by hand: credentials, one entry in `Pairs`, and the Data Sync as the
Layer's Data Destination.

### With the plugin

1. Open the Mission (map menu → Data Sync → the Mission).
2. Open **Caltopo Sync** → **CloudTAK ETL Pairs** → **+**.
3. Pick the Connection, the Mission and enter the CalTopo map ID or URL. The map must be a
   **team** map – a map in someone's personal account can't be written to.
4. **Create Pair (Dry Run)**. The plugin creates the Data Sync (or reuses the Mission's
   existing one), the Layer and its settings. The first run takes a minute or two while AWS
   sets the Layer up.
5. Wait for the row to show **Dry Run** and read **Changes** – what it *would* do on the map.
   Nothing is written to CalTopo yet.
6. If it looks right, **Go Live**. From the next run it writes both ways.

## Reading the pair list

| Status | Meaning | What to do |
|---|---|---|
| **OK** | The last run worked. | Nothing. |
| **Dry Run** | Planning only – nothing is written to CalTopo. | Check **Changes**, then Go Live. |
| **Waiting** | The Layer hasn't run yet. | Wait two minutes after creating it. |
| **Not Running** | No run for over 5 minutes. | Check the Layer is enabled and its Deployment tab says `CREATE_COMPLETE` or `UPDATE_COMPLETE`. |
| **Error** | The last run failed. The red line under the row says why. | See below. |
| **Items Missing** | Some CalTopo objects can't be put in the Mission. The orange list under the row names each one and why. | Fix them in CalTopo (usually: redraw the shape ending on its first point). They come over on the next run. |
| **Paused** | The Layer's Enabled switch is off. | Turn it on to resume. |

Common errors:

- **`400 Error saving object`** – the CalTopo service account can't edit the map. Move the map
  into the team account (a share link doesn't help – CalTopo's API ignores those).
- **`401 Invalid Token`** – the Layer's CloudTAK API token is wrong or from another CloudTAK.
- **`Failed to post layer to ETL (400 - Submitted)`** – CloudTAK refused some objects; the rest
  went through. From etl-caltopo 5.19.1 such objects are kept back and listed under **Items
  Missing** instead. Report it with the map ID if you still see this.
- **CalTopo → TAK not connected** (yellow, with a **Fix** button) – the Layer has no Data Sync,
  so nothing drawn in CalTopo reaches the Mission. Click **Fix**.

## Creating a Caltopo map

**Create Caltopo Map** (below the pair list) makes a new map in the team's Caltopo account, named
after the TAK Mission you pick (the active one to start with, or the DR/Activity number with
none), and fills it into the pair form. Behind the scenes it adds a CloudTAK
**Event** at the call location that asks the CalTopo Layer for a map, so pick channels that include
the Connection's. The Layer needs its **Outgoing** settings `AccountId` and `TeamId` filled in.
Events made by other plugins (incidents, field teams) never create maps.

## Nothing from CalTopo shows up in TAK

TAK items reach CalTopo, but things drawn in CalTopo never appear in the Mission. The robot has
no key: the Layer has no **Data Destination**. Its log (Layer → **Deployment** → **Layer Runtime
Logs**) says `CalTopo -> TAK: the Layer has no Data Sync` every minute.

1. **Make a key on the Layer's own Connection.** Open the Connection (Admin → Connections →
   Caltopo) → **Data Syncs** → **+**. Set **Data Name** to the Mission's **exact** name – copy it
   from the plugin's pair row. Leave **Mission Sync** and **Mission Layer Diff** on, and **Save**.
   Because the name matches, this attaches to the existing Mission rather than making a new one.
   (A Data Sync for that Mission on a *different* Connection doesn't count, and isn't listed.)
2. **Give it to the robot.** Open the Layer → **Incoming** → **Config** → the pencil → the gear
   next to **Data Destination** → pick the new Data Sync → **Save**.

Within a minute the log says `CalTopo -> TAK: sent N CalTopo objects`.

## Safe and unsafe buttons

| Action | Safe? | What happens |
|---|---|---|
| Layer → edit → **Enabled** off/on | ✅ | Pauses/resumes the pair. |
| Layer → **Deployment** → change Task version + redeploy | ✅ | Updates the program. Changing the version alone does nothing until the stack is redeployed. |
| Plugin → **Go Live** | ⚠️ | Starts writing to CalTopo, which has **no undo**. Read the dry run first. |
| Editing a Layer's **Environment** (settings) | ⚠️ | Saving clears the pair's memory of which items match; the next run matches them up again. Don't edit while a pair is busy. |
| Deleting a **Layer** | ⚠️ | Stops that pair and removes its AWS resources. Mission and map keep their items. |
| Deleting a **Data Sync** or turning its **Mission Sync** off | ❌ | **Deletes the TAK Mission.** |
| Deleting the **Connection** | ❌ | Removes every Layer and Data Sync on it. |

## Memory and cost

- Use **256 MB** for a Layer. A pair uses about 175 MB and half a second per run.
- Running every minute, that is about **$0.10 a month per pair**, and AWS's free Lambda
  allowance covers roughly 30 such pairs – usually **$0**.
- 512 MB doubles the price without making it noticeably faster (the runs mostly wait on CalTopo
  and the TAK Server). Raise it only if a Layer's logs show **Max Memory Used** above ~230 MB.
- A Layer that is disabled or deleted costs nothing.

## Who can do this

Only **CloudTAK System Administrators** see Connections, Layers and the pair list. Give a manager
this right in **Admin → Users → the user → System Administrator**. It only affects CloudTAK, not
their TAK Server groups.
