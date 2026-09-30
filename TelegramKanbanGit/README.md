# Telegram → GitHub Backlog Bot

Bot Telegram care creează automat **issue-uri** în GitHub din mesaje, text și poze (inclusiv forward-uri) și le adaugă direct în **Backlog** pe un GitHub Project V2.

Suportă și **modul combinare**: aduni mai multe mesaje/imagini și le transformi într-un singur issue.

---

## Cuprins

1. [Ce face botul](#1-ce-face-botul)
2. [Cerințe](#2-cerințe)
3. [Structura proiectului](#3-structura-proiectului)
4. [Pasul 1 – Creează botul Telegram](#4-pasul-1--creează-botul-telegram)
5. [Pasul 2 – Token GitHub](#5-pasul-2--token-github)
6. [Pasul 3 – ID-urile Project V2](#6-pasul-3--id-urile-project-v2)
7. [Pasul 4 – Cont Cloudinary](#7-pasul-4--cont-cloudinary)
8. [Pasul 5 – Fișierul `.env`](#8-pasul-5--fișierul-env)
9. [Pasul 6 – Instalare locală](#9-pasul-6--instalare-locală)
10. [Pasul 7 – Test local (cu ngrok)](#10-pasul-7--test-local-cu-ngrok)
11. [Pasul 8 – Deploy pe Vercel](#11-pasul-8--deploy-pe-vercel)
12. [Pasul 9 – Setare Webhook Telegram](#12-pasul-9--setare-webhook-telegram)
13. [Comenzi bot](#13-comenzi-bot)
14. [Troubleshooting](#14-troubleshooting)

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

## 4. Pasul 1 – Creează botul Telegram

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

## 5. Pasul 2 – Token GitHub

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

## 6. Pasul 3 – ID-urile Project V2

Ai nevoie de 3 valori:

| Variabilă | Ce reprezintă |
|-----------|---------------|
| `PROJECT_ID` | ID-ul proiectului GitHub |
| `STATUS_FIELD_ID` | ID-ul câmpului „Status” |
| `BACKLOG_OPTION_ID` | ID-ul opțiunii „Backlog” |

### Cum le afli

1. Deschide [GitHub GraphQL Explorer](https://docs.github.com/en/graphql/overview/explorer)
2. Autentifică-te cu token-ul tău
3. Rulează următoarea query (înlocuiește valorile):

```graphql
query {
  user(login: "GITHUB_OWNER") {          # sau organization(login: "ORG_NAME")
    projectV2(number: 1) {               # numărul proiectului din URL
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

4. Din răspuns:
   - `projectV2.id` → `PROJECT_ID` (ex: `PVT_kwDOA...`)
   - `field.id` → `STATUS_FIELD_ID` (ex: `PVTSSF_lADOA...`)
   - din `options`, găsește cea cu `"name": "Backlog"` → `BACKLOG_OPTION_ID` (ex: `f75ad846`)

> Numărul proiectului îl găsești în URL:  
> `https://github.com/users/USERNAME/projects/1` → numărul este `1`.

---

## 7. Pasul 4 – Cont Cloudinary

1. Creează cont pe [cloudinary.com](https://cloudinary.com) (plan free e suficient)
2. Mergi la **Settings** → **API Keys**
3. Copiază:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET`

Imaginile din Telegram sunt încărcate aici ca să poată fi afișate public în issue-urile GitHub.

---

## 8. Pasul 5 – Fișierul `.env`

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

## 9. Pasul 6 – Instalare locală

```bash
# clonează repository-ul
git clone https://github.com/GITHUB_OWNER/GITHUB_REPO.git
cd GITHUB_REPO

# instalează dependențele
npm install
```

---

## 10. Pasul 7 – Test local (cu ngrok)

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

## 11. Pasul 8 – Deploy pe Vercel

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

## 12. Pasul 9 – Setare Webhook Telegram

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

## 13. Comenzi bot

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

## 14. Troubleshooting

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