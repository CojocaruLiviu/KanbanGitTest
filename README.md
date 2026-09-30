# Telegram → GitHub Backlog Bot

Bot Telegram care creează automat **issue-uri** în GitHub din mesaje, text și poze (inclusiv forward-uri) și le adaugă direct în **Backlog** pe un GitHub Project V2.

Suportă și **modul combinare**: aduni mai multe mesaje/imagini și le transformi într-un singur issue.

---

## Cuprins

1. [Ce face botul](#1-ce-face-botul)
2. [Cerințe](#2-cerințe)
3. [Structura proiectului](#3-structura-proiectului)
4. [Pasul 1 – Creează Kanban-ul (GitHub Project)](#4-pasul-1--creează-kanban-ul-github-project)
5. [Pasul 2 – Creează botul Telegram](#5-pasul-2--creează-botul-telegram)
6. [Pasul 3 – Token GitHub](#6-pasul-3--token-github)
7. [Pasul 4 – ID-urile Project V2](#7-pasul-4--id-urile-project-v2)
8. [Pasul 5 – Cont Cloudinary](#8-pasul-5--cont-cloudinary)
9. [Pasul 6 – Fișierul `.env`](#9-pasul-6--fișierul-env)
10. [Pasul 7 – Instalare locală](#10-pasul-7--instalare-locală)
11. [Pasul 8 – Test local (cu ngrok)](#11-pasul-8--test-local-cu-ngrok)
12. [Pasul 9 – Deploy pe Vercel](#12-pasul-9--deploy-pe-vercel)
13. [Pasul 10 – Setare Webhook Telegram](#13-pasul-10--setare-webhook-telegram)
14. [Comenzi bot](#14-comenzi-bot)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Ce face botul

| Acțiune | Rezultat |
|---------|----------|
| Trimiți text | Creează issue cu textul respectiv |
| Trimiți / forwardezi poză | Creează issue + încarcă imaginea pe Cloudinary + o afișează în body |
| Forwardezi mesaj | Salvează și sursa (cine a trimis original) |
| `/combine` → mesaje → `/stop` | Creează **1 issue combinat** din toate mesajele |

Issue-ul este adăugat automat în **GitHub Project** cu statusul **Backlog**.

---

## 2. Cerințe

- Cont [GitHub](https://github.com)
- Cont [Telegram](https://telegram.org) + [@BotFather](https://t.me/BotFather)
- Cont [Cloudinary](https://cloudinary.com) (gratuit)
- Cont [Vercel](https://vercel.com) (pentru deploy)
- Node.js **20+** (doar dacă testezi local)

---

## 3. Structura proiectului

```
├── bot.js              # Handler principal (folosit pe Vercel)
├── index.js            # Versiune server HTTP (local + combine)
├── package.json
├── package-lock.json
├── vercel.json         # Configurație Vercel
├── .env.example        # Model variabile de mediu
└── README.md
```

> Pe **Vercel** se rulează `bot.js`.  
> Modul `/combine` există doar în `index.js` (versiunea locală).

---

## 4. Pasul 1 – Creează Kanban-ul (GitHub Project)

Cel mai simplu mod de a avea un Kanban pe GitHub este prin **GitHub Projects**.

### 4.1 Creează proiectul

1. Intră pe [GitHub Projects](https://github.com/users/USERNAME/projects) (înlocuiește `USERNAME` cu username-ul tău)  
   sau: profil → tab **Projects** → **New project**
2. Apasă **New project**
3. Alege tipul **Board**
4. Introdu un nume, de exemplu:
   ```
   PandaTur Tasks
   ```
5. Apasă **Create project**

Vei avea automat coloane de tip:

- **Todo**
- **In Progress**
- **Done**

Poți redenumi coloanele (ex: `Backlog`, `In Progress`, `Done`) din setările câmpului **Status**.

### 4.2 Leagă Kanban-ul de repository

Ca issue-urile create de bot să apară în acest Project:

1. Deschide proiectul creat
2. Click pe **⋯** (meniu) → **Settings**
3. La secțiunea **Linked repositories** (sau **Manage access** / **Linked repositories**):
   - Apasă **Link a repository**
   - Selectează repository-ul tău (ex: `GITHUB_OWNER/GITHUB_REPO`)
4. Salvează

Alternativ, din repository:

1. Intră pe repository → tab **Projects**
2. Click **Link a project** → selectează proiectul creat

### 4.3 (Opțional) Adaugă coloana Backlog

Dacă vrei o coloană explicită **Backlog**:

1. În Project → click pe câmpul **Status** (sau **+** pentru câmp nou)
2. Adaugă o opțiune nouă numită `Backlog`
3. Trage-o pe prima poziție

> ID-ul acestei opțiuni (`BACKLOG_OPTION_ID`) îl vei folosi mai târziu în `.env`.

Acum poți crea issue-uri manual din Kanban cu **+ Add item → Create new issue**, iar botul le va crea automat.

---

## 5. Pasul 2 – Creează botul Telegram

1. Deschide Telegram și caută **[@BotFather](https://t.me/BotFather)**
2. Trimite comanda:
   ```
   /newbot
   ```
3. Alege un nume (ex: `My Backlog Bot`)
4. Alege un username (trebuie să se termine cu `bot`, ex: `my_backlog_bot`)
5. BotFather îți dă un **token** de forma:
   ```
   123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. **Salvează token-ul** – va fi `BOT_TOKEN`

---

## 6. Pasul 3 – Token GitHub

1. Mergi pe GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Bifează următoarele scopes:
   - `repo` (full control)
   - `project` (full control)
   - `read:org` (dacă proiectul e într-o organizație)
4. Generează token-ul (începe cu `ghp_...`)
5. **Salvează-l imediat** – va fi `GITHUB_TOKEN`

> Token-ul are acces la repository-ul tău și la Projects.

---

## 7. Pasul 4 – ID-urile Project V2

Ai nevoie de 3 valori:

| Variabilă | Ce reprezintă |
|-----------|---------------|
| `PROJECT_ID` | ID-ul proiectului GitHub |
| `STATUS_FIELD_ID` | ID-ul câmpului „Status” |
| `BACKLOG_OPTION_ID` | ID-ul opțiunii „Backlog” |

### Cum le afli

> **Notă:** GitHub a scos GraphQL Explorer-ul din documentație (noiembrie 2025).  
> Folosește una din metodele de mai jos.

#### Metoda 1 – GitHub CLI (cea mai simplă)

**1. Instalează GitHub CLI**

```powershell
# Windows (PowerShell)
winget install GitHub.cli

# macOS
brew install gh

# Linux – vezi https://cli.github.com/
```

**2. Autentifică-te**

```powershell
gh auth login
```

Răspunde la întrebări astfel:

```
? Where do you use GitHub? GitHub.com
? What is your preferred protocol for Git operations on this host? HTTPS
? Authenticate Git with your GitHub credentials? Yes
? How would you like to authenticate GitHub CLI? Login with a web browser
```

Se deschide browser-ul → introduci codul one-time → confirmi.  
La final ar trebui să vezi:

```
✓ Authentication complete.
✓ Logged in as YourUsername
```

**3. Rulează query-ul** (înlocuiește `YourUsername` și numărul proiectului):

```powershell
gh api graphql -f query='
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
}'
```

Dacă proiectul e al unei **organizații**, folosește:

```powershell
gh api graphql -f query='
query {
  organization(login: "YourOrgName") {
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
}'
```

**4. Exemplu de răspuns (date fictive)**

```json
{
  "data": {
    "user": {
      "projectV2": {
        "id": "PVT_kwDOABC123xxxxxxxx",
        "title": "PandaTur Tasks",
        "field": {
          "id": "PVTSSF_lADOABC123xxxxxxxx",
          "name": "Status",
          "options": [
            { "id": "f75ad846", "name": "Backlog" },
            { "id": "47fc9ee4", "name": "Todo" },
            { "id": "98236672", "name": "In Progress" },
            { "id": "d2317e8c", "name": "Done" }
          ]
        }
      }
    }
  }
}
```

Din acest exemplu ai pune în `.env`:

```env
PROJECT_ID=PVT_kwDOABC123xxxxxxxx
STATUS_FIELD_ID=PVTSSF_lADOABC123xxxxxxxx
BACKLOG_OPTION_ID=f75ad846
```

#### Metoda 2 – Client GraphQL (Insomnia / Altair / Postman)

1. Endpoint: `https://api.github.com/graphql`
2. Method: `POST`
3. Header:
   ```
   Authorization: Bearer ghp_TOKENUL_TAU
   ```
4. Body (GraphQL query):

```graphql
query {
  user(login: "GITHUB_OWNER") {
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

#### Ce extragi din răspuns

- `projectV2.id` → `PROJECT_ID` (ex: `PVT_kwDOA...`)
- `field.id` → `STATUS_FIELD_ID` (ex: `PVTSSF_lADOA...`)
- din `options`, găsește cea cu `"name": "Backlog"` (sau `"Todo"`) → `BACKLOG_OPTION_ID` (ex: `f75ad846`)

> Numărul proiectului îl găsești în URL:  
> `https://github.com/users/USERNAME/projects/1` → numărul este `1`.

---

## 8. Pasul 5 – Cont Cloudinary

1. Creează cont pe [cloudinary.com](https://cloudinary.com) (plan free e suficient)
2. Mergi la **Settings** → **API Keys**
3. Copiază:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET`

Imaginile din Telegram sunt încărcate aici ca să poată fi afișate public în issue-urile GitHub.

---

## 9. Pasul 6 – Fișierul `.env`

1. Copiază fișierul exemplu:
   ```bash
   cp .env.example .env
   ```
2. Completează toate valorile:

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
BACKLOG_OPTION_ID=f75ad846

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Nu comite niciodată `.env` pe GitHub!**  
> Adaugă-l în `.gitignore`.

---

## 10. Pasul 7 – Instalare locală

```bash
# clonează repository-ul
git clone https://github.com/GITHUB_OWNER/GITHUB_REPO.git
cd GITHUB_REPO

# instalează dependențele
npm install
```

---

## 11. Pasul 8 – Test local (cu ngrok)

1. Pornește botul:
   ```bash
   node index.js
   ```
   Ar trebui să vezi: `Server started`

2. Într-un alt terminal, pornește un tunnel public:
   ```bash
   npx ngrok http 3000
   ```
   Copiază URL-ul HTTPS (ex: `https://abc123.ngrok-free.app`)

3. Setează webhook-ul Telegram:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://abc123.ngrok-free.app"
   ```

4. Verifică:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```

5. Deschide botul pe Telegram și trimite `/start` + un mesaj de test.

---

## 12. Pasul 9 – Deploy pe Vercel

### Varianta A – Prin UI (recomandat)

1. Intră pe [vercel.com](https://vercel.com) și autentifică-te cu GitHub
2. Click **Add New…** → **Project**
3. Importă repository-ul
4. Setări:
   - **Framework Preset**: Other
   - **Root Directory**: lasă gol
   - **Build Command**: lasă gol
   - **Output Directory**: lasă gol
   - **Install Command**: `npm install`
5. La **Environment Variables** adaugă **toate** cheile din `.env`:
   - `BOT_TOKEN`
   - `GITHUB_TOKEN`
   - `GITHUB_OWNER`
   - `GITHUB_REPO`
   - `PROJECT_ID`
   - `STATUS_FIELD_ID`
   - `BACKLOG_OPTION_ID`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
6. Click **Deploy**

### Varianta B – Prin CLI

```bash
npm i -g vercel
vercel login
vercel
```

Adaugă environment variables:

```bash
vercel env add BOT_TOKEN
vercel env add GITHUB_TOKEN
vercel env add GITHUB_OWNER
vercel env add GITHUB_REPO
vercel env add PROJECT_ID
vercel env add STATUS_FIELD_ID
vercel env add BACKLOG_OPTION_ID
vercel env add CLOUDINARY_CLOUD_NAME
vercel env add CLOUDINARY_API_KEY
vercel env add CLOUDINARY_API_SECRET
```

Apoi:

```bash
vercel --prod
```

### Fișier `vercel.json` (deja inclus)

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

După deploy vei primi un URL de forma:  
`https://telegram-github-bot-xxxx.vercel.app`

---

## 13. Pasul 10 – Setare Webhook Telegram

Înlocuiește valorile și rulează:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://PROIECTUL-TAU.vercel.app"
```

Verifică că e setat corect:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Răspunsul trebuie să conțină:

```json
{
  "ok": true,
  "result": {
    "url": "https://PROIECTUL-TAU.vercel.app",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 14. Comenzi bot

| Comandă | Descriere |
|---------|-----------|
| `/start` | Mesaj de bun venit + confirmare că botul e activ |
| `/help` | Instrucțiuni de folosire |
| `/combine` | Activează modul combinare (doar în `index.js`) |
| `/stop` | Creează 1 issue din toate mesajele adunate |
| `/cancel` | Anulează combinarea fără a crea issue |

### Fără `/combine`

Fiecare text, poză sau document-imagine devine un **issue separat**.

### Cu `/combine` (versiunea locală)

1. Trimite `/combine`
2. Forwardează sau trimite mai multe mesaje / imagini
3. Trimite `/stop`
4. Botul creează **un singur issue** cu tot conținutul

---

## 15. Troubleshooting

| Problemă | Cauză probabilă | Soluție |
|----------|-----------------|---------|
| Bot nu răspunde deloc | Webhook greșit sau ne-setat | Rulează `getWebhookInfo` și verifică URL-ul |
| `Missing ENV: ...` | Variabilă lipsă pe Vercel | Adaugă-o în Project Settings → Environment Variables → Redeploy |
| Eroare 401 / 403 GitHub | Token expirat sau fără scopes | Regenerează token cu `repo` + `project` |
| Issue creat, dar nu e în Backlog | `PROJECT_ID` / `STATUS_FIELD_ID` / `BACKLOG_OPTION_ID` greșite | Re-rulează query-ul GraphQL și verifică ID-urile |
| Imaginea nu apare în issue | Cloudinary credentials greșite | Verifică Cloud Name, API Key și Secret |
| Timeout pe Vercel | Imagine prea mare | Reduce rezoluția sau folosește transformări Cloudinary |
| `Method Not Allowed` | Request non-POST către webhook | Normal – Telegram trimite doar POST |

---

## Licență

MIT
```
