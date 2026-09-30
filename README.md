# Telegram → GitHub Backlog Bot

A Telegram bot that automatically creates **GitHub issues** from messages, text, and photos (including forwards) and adds them to the **Backlog** column of a GitHub Project V2 board.

It also supports a **combine mode**: collect multiple messages/images and turn them into a single issue.

---

## Table of Contents

1. [What the bot does](#1-what-the-bot-does)
2. [Requirements](#2-requirements)
3. [Project structure](#3-project-structure)
4. [Step 1 – Create the Kanban board (GitHub Project)](#4-step-1--create-the-kanban-board-github-project)
5. [Step 2 – Create the Telegram bot](#5-step-2--create-the-telegram-bot)
6. [Step 3 – GitHub token](#6-step-3--github-token)
7. [Step 4 – Project V2 IDs](#7-step-4--project-v2-ids)
8. [Step 5 – Cloudinary account](#8-step-5--cloudinary-account)
9. [Step 6 – The `.env` file](#9-step-6--the-env-file)
10. [Step 7 – Local install](#10-step-7--local-install)
11. [Step 8 – Local testing (with ngrok)](#11-step-8--local-testing-with-ngrok)
12. [Step 9 – Deploy on Vercel](#12-step-9--deploy-on-vercel)
13. [Step 10 – Set the Telegram webhook](#13-step-10--set-the-telegram-webhook)
14. [Bot commands](#14-bot-commands)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What the bot does

| Action | Result |
|--------|--------|
| Send text | Creates an issue in **Todo** |
| Send / forward a photo | Creates an issue + uploads the image to Cloudinary + embeds it in the body |
| `/todo <text>` | Creates an issue in **Todo** |
| `/inprogress <text>` | Creates an issue in **In Progress** |
| `/done <text>` | Creates an issue in **Done** |
| Forward a message | Also saves the original source (who sent it) |
| `/combine` → messages → `/stop` | Creates **1 combined issue** from all collected messages |

The issue is automatically added to the **GitHub Project** in the chosen status column.

---

## 2. Requirements

- [GitHub](https://github.com) account
- [Telegram](https://telegram.org) account + [@BotFather](https://t.me/BotFather)
- [Cloudinary](https://cloudinary.com) account (free plan is enough)
- [Vercel](https://vercel.com) account (for deployment)
- Node.js **20+** (only if testing locally)

---

## 3. Project structure

```
├── bot.js              # Main handler (used on Vercel)
├── index.js            # HTTP server version (local + combine mode)
├── package.json
├── package-lock.json
├── vercel.json         # Vercel configuration
├── .env.example        # Environment variables template
└── README.md
```

> On **Vercel**, `bot.js` is used.  
> The `/combine` mode exists only in `index.js` (local version).

---

## 4. Step 1 – Create the Kanban board (GitHub Project)

The easiest way to get a Kanban board on GitHub is with **GitHub Projects**.

### 4.1 Create the project

1. Go to [GitHub Projects](https://github.com/users/USERNAME/projects) (replace `USERNAME` with yours)  
   or: profile → **Projects** tab → **New project**
2. Click **New project**
3. Choose the **Board** type
4. Enter a name, for example:
   ```
   My Tasks
   ```
5. Click **Create project**

You will automatically get columns like:

- **Todo**
- **In Progress**
- **Done**

You can rename columns (e.g. `Backlog`, `In Progress`, `Done`) in the **Status** field settings.

### 4.2 Link the Kanban board to a repository

So that issues created by the bot appear in this Project:

1. Open the project you just created
2. Click **⋯** (menu) → **Settings**
3. Under **Linked repositories** (or **Manage access** / **Linked repositories**):
   - Click **Link a repository**
   - Select your repository (e.g. `GITHUB_OWNER/GITHUB_REPO`)
4. Save

Alternatively, from the repository:

1. Open the repository → **Projects** tab
2. Click **Link a project** → select the project you created

### 4.3 (Optional) Add a Backlog column

If you want an explicit **Backlog** column:

1. In the Project → click the **Status** field (or **+** for a new field)
2. Add a new option named `Backlog`
3. Drag it to the first position

> The ID of this option (`BACKLOG_OPTION_ID`) will be used later in `.env`.

You can also create issues manually from the Kanban with **+ Add item → Create new issue**. The bot will create them automatically.

---

## 5. Step 2 – Create the Telegram bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**
2. Send the command:
   ```
   /newbot
   ```
3. Choose a name (e.g. `My Backlog Bot`)
4. Choose a username (must end with `bot`, e.g. `my_backlog_bot`)
5. BotFather gives you a **token** like:
   ```
   123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. **Save the token** – this will be `BOT_TOKEN`

---

## 6. Step 3 – GitHub token

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Enable the following scopes:
   - `repo` (full control)
   - `project` (full control)
   - `read:org` (if the project belongs to an organization)
4. Generate the token (starts with `ghp_...`)
5. **Save it immediately** – this will be `GITHUB_TOKEN`

> The token needs access to your repository and to Projects.

---

## 7. Step 4 – Project V2 IDs

You need these values:

| Variable | What it is | Required |
|----------|------------|----------|
| `PROJECT_ID` | The GitHub Project ID | Yes |
| `STATUS_FIELD_ID` | The ID of the “Status” field | Yes |
| `BACKLOG_OPTION_ID` | Default column (Todo / Backlog) | Yes |
| `TODO_OPTION_ID` | ID for **Todo** (`/todo`) | Optional* |
| `IN_PROGRESS_OPTION_ID` | ID for **In Progress** (`/inprogress`) | Optional* |
| `DONE_OPTION_ID` | ID for **Done** (`/done`) | Optional* |

\* If omitted, the bot falls back to `BACKLOG_OPTION_ID`.

### How to get them

> **Note:** GitHub removed the GraphQL Explorer from the documentation (November 2025).  
> Use one of the methods below.

#### Method 1 – GitHub CLI (recommended)

**1. Install GitHub CLI**

```powershell
# Windows (PowerShell)
winget install GitHub.cli

# macOS
brew install gh

# Linux – see https://cli.github.com/
```

**2. Authenticate**

```powershell
gh auth login
```

Answer the prompts like this:

```
? Where do you use GitHub? GitHub.com
? What is your preferred protocol for Git operations on this host? HTTPS
? Authenticate Git with your GitHub credentials? Yes
? How would you like to authenticate GitHub CLI? Login with a web browser
```

The browser opens → enter the one-time code → confirm.  
At the end you should see:

```
✓ Authentication complete.
✓ Logged in as YourUsername
```

**3. Add the Projects scope**

The default `gh` token does **not** include Projects access. Run:

```powershell
gh auth refresh -s read:project,project
```

Confirm again in the browser.

**4. Create the query file** (PowerShell)

```powershell
@"
query {
  user(login: \"YourUsername\") {
    projectV2(number: 1) {
      id
      title
      field(name: \"Status\") {
        ... on ProjectV2SingleSelectField {
          id
          name
          options {
            id
            name
          }
        }
      }
    }
  }
}
"@ | Out-File -Encoding utf8 query.graphql
```

> Replace `YourUsername` with your GitHub username.  
> `number: 1` = the project number from the URL (`/projects/1`).

If the project belongs to an **organization**, replace `user(login: ...)` with `organization(login: "YourOrgName")`.

**5. Run the query**

```powershell
gh api graphql -f query="$(Get-Content -Raw query.graphql)"
```

**6. Example response**

```json
{
  "data": {
    "user": {
      "projectV2": {
        "id": "PVT_kwDOABC123xyzExample",
        "title": "My Kanban Board",
        "field": {
          "id": "PVTSSF_lADOABC123xyzExample00",
          "name": "Status",
          "options": [
            { "id": "f75ad846", "name": "Todo" },
            { "id": "47fc9ee4", "name": "In Progress" },
            { "id": "98236657", "name": "Done" }
          ]
        }
      }
    }
  }
}
```

From this response put into `.env`:

```env
PROJECT_ID=PVT_kwDOABC123xyzExample
STATUS_FIELD_ID=PVTSSF_lADOABC123xyzExample00

# Default column
BACKLOG_OPTION_ID=f75ad846

# Columns for /todo, /inprogress, /done
TODO_OPTION_ID=f75ad846
IN_PROGRESS_OPTION_ID=47fc9ee4
DONE_OPTION_ID=98236657
```

Map each option from the GraphQL response:

| Option `name` | Variable |
|---------------|----------|
| `"Todo"` | `TODO_OPTION_ID` + `BACKLOG_OPTION_ID` |
| `"In Progress"` | `IN_PROGRESS_OPTION_ID` |
| `"Done"` | `DONE_OPTION_ID` |

> If you don’t have a “Backlog” column, use the ID of **Todo** as `BACKLOG_OPTION_ID`.  
> The values above are **examples** – replace them with the ones from your real response.

#### Method 2 – GraphQL client (Insomnia / Altair / Postman)

1. Endpoint: `https://api.github.com/graphql`
2. Method: `POST`
3. Header:
   ```
   Authorization: Bearer ghp_YOUR_TOKEN
   ```
4. Body (GraphQL query):

```graphql
query {
  user(login: "YourUsername") {
    projectV2(number: 1) {
      id
      title
      field(name: "Status") {
        ... on ProjectV2SingleSelectField {
          id
          name
          options {
            id
            name
          }
        }
      }
    }
  }
}
```

#### What to extract from the response

- `projectV2.id` → `PROJECT_ID` (e.g. `PVT_kwDOA...`)
- `field.id` → `STATUS_FIELD_ID` (e.g. `PVTSSF_lADOA...`)
- from `options`, find the one with `"name": "Backlog"` (or `"Todo"`) → `BACKLOG_OPTION_ID` (e.g. `f75ad846`)

> The project number is in the URL:  
> `https://github.com/users/USERNAME/projects/1` → the number is `1`.

---

## 8. Step 5 – Cloudinary account

1. Create an account on [cloudinary.com](https://cloudinary.com) (free plan is enough)
2. Go to **Settings** → **API Keys**
3. Copy:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET`

Telegram images are uploaded here so they can be displayed publicly inside GitHub issues.

---

## 9. Step 6 – The `.env` file

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Fill in all values:

```env
# Telegram
BOT_TOKEN=123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-username-or-org
GITHUB_REPO=your-repo-name

# GitHub Project V2
PROJECT_ID=PVT_kwDOAxxxxxxxxxxxxxxxxxxxx
STATUS_FIELD_ID=PVTSSF_lADOAxxxxxxxxxxxxxxxxxxxx

# Default column (required)
BACKLOG_OPTION_ID=f75ad846

# Status columns for /todo, /inprogress, /done (optional but recommended)
TODO_OPTION_ID=f75ad846
IN_PROGRESS_OPTION_ID=47fc9ee4
DONE_OPTION_ID=98236657

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Never commit `.env` to GitHub!**  
> Add it to `.gitignore`.

---

## 10. Step 7 – Local install

```bash
# clone the repository
git clone https://github.com/GITHUB_OWNER/GITHUB_REPO.git
cd GITHUB_REPO

# install dependencies
npm install
```

---

## 11. Step 8 – Local testing (with ngrok)

1. Start the bot:
   ```bash
   node index.js
   ```
   You should see: `Server started`

2. In another terminal, start a public tunnel:
   ```bash
   npx ngrok http 3000
   ```
   Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`)

3. Set the Telegram webhook:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://abc123.ngrok-free.app"
   ```

4. Verify:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```

5. Open the bot on Telegram and send `/start` + a test message.

---

## 12. Step 9 – Deploy on Vercel

### Option A – Via UI (recommended)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New…** → **Project**
3. Import the repository
4. Settings:
   - **Framework Preset**: Other
   - **Root Directory**: leave empty
   - **Build Command**: leave empty
   - **Output Directory**: leave empty
   - **Install Command**: `npm install`
5. Under **Environment Variables** add **all** keys from `.env`:
   - `BOT_TOKEN`
   - `GITHUB_TOKEN`
   - `GITHUB_OWNER`
   - `GITHUB_REPO`
   - `PROJECT_ID`
   - `STATUS_FIELD_ID`
   - `BACKLOG_OPTION_ID`
   - `TODO_OPTION_ID`
   - `IN_PROGRESS_OPTION_ID`
   - `DONE_OPTION_ID`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
6. Click **Deploy**

### Option B – Via CLI

```bash
npm i -g vercel
vercel login
vercel
```

Add environment variables:

```bash
vercel env add BOT_TOKEN
vercel env add GITHUB_TOKEN
vercel env add GITHUB_OWNER
vercel env add GITHUB_REPO
vercel env add PROJECT_ID
vercel env add STATUS_FIELD_ID
vercel env add BACKLOG_OPTION_ID
vercel env add TODO_OPTION_ID
vercel env add IN_PROGRESS_OPTION_ID
vercel env add DONE_OPTION_ID
vercel env add CLOUDINARY_CLOUD_NAME
vercel env add CLOUDINARY_API_KEY
vercel env add CLOUDINARY_API_SECRET
```

Then:

```bash
vercel --prod
```

### `vercel.json` file (already included)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "bot.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "bot.js"
    }
  ]
}
```

After deploy you will get a URL like:  
`https://your-project.vercel.app`

---

## 13. Step 10 – Set the Telegram webhook

Replace the values and run:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://YOUR-PROJECT.vercel.app"
```

Verify it is set correctly:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

The response should contain:

```json
{
  "ok": true,
  "result": {
    "url": "https://YOUR-PROJECT.vercel.app",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

> If you see `"last_error_message": "Wrong response from the webhook: 405 Method Not Allowed"`, check that `vercel.json` routes to `bot.js` and that all environment variables are set on Vercel, then redeploy.

---

## 14. Bot commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + confirmation that the bot is active |
| `/help` | Usage instructions |
| `/todo <text>` | Create task in **Todo** column |
| `/inprogress <text>` | Create task in **In Progress** column |
| `/inprogres <text>` | Same as `/inprogress` |
| `/done <text>` | Create task in **Done** column |
| `/combine` | Enable combine mode |
| `/stop` | Create 1 issue from all collected messages |
| `/cancel` | Cancel combine mode without creating an issue |

### Status commands (put task in a specific column)

```
/todo Fix login page
/inprogress Working on API
/done Bug fixed on production
```

You can also send a **photo** with a caption:

```
/done screenshot after fix
```

If you send plain text or a photo **without** a status command, the task goes to **Todo** (default).

### With `/combine`

1. Send `/combine`
2. Forward or send multiple messages / images
3. Send `/stop`
4. The bot creates **a single issue** with all the content (status: Todo)

---

## 15. Troubleshooting

| Problem | Likely cause | Solution |
|---------|--------------|----------|
| Bot does not respond at all | Wrong or unset webhook | Run `getWebhookInfo` and check the URL |
| `Missing ENV: ...` | Missing variable on Vercel | Add it in Project Settings → Environment Variables → Redeploy |
| GitHub 401 / 403 error | Expired token or missing scopes | Regenerate token with `repo` + `project` |
| Issue created but not in the board | Wrong `PROJECT_ID` / `STATUS_FIELD_ID` / `BACKLOG_OPTION_ID` | Re-run the GraphQL query and verify the IDs |
| Image does not appear in the issue | Wrong Cloudinary credentials | Check Cloud Name, API Key and Secret |
| Timeout on Vercel | Image too large | Reduce resolution or use Cloudinary transformations |
| `405 Method Not Allowed` | Webhook hits a non-POST handler or wrong routing | Ensure `vercel.json` routes to `bot.js` and redeploy |
| `Method Not Allowed` on GET | Normal for non-POST requests | Telegram only sends POST; GET is only for health checks |

---

## License

MIT
```
