import http from "http";
import { Telegraf } from "telegraf";
import { graphql } from "@octokit/graphql";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";

const requiredEnv = [
  "BOT_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "PROJECT_ID",
  "STATUS_FIELD_ID",
  "BACKLOG_OPTION_ID",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing ENV: ${key}`);
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const bot = new Telegraf(process.env.BOT_TOKEN);

const github = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

let repositoryIdCache = null;
const combineSessions = new Map();

async function getRepositoryId() {
  if (repositoryIdCache) return repositoryIdCache;

  const data = await github(
    `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
      }
    }
    `,
    {
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
    }
  );

  repositoryIdCache = data.repository.id;
  return repositoryIdCache;
}

function getTaskText(ctx) {
  return ctx.message?.text?.trim() || ctx.message?.caption?.trim() || "";
}

function cleanTitle(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 250);
}

function getChatKey(ctx) {
  return String(ctx.message?.chat?.id || ctx.chat?.id || "default");
}

function getSenderName(ctx) {
  const user = ctx.message?.from;
  if (!user) return "Utilizator necunoscut";

  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  const username = user.username ? `@${user.username}` : "";

  return `${fullName || "Fără nume"} ${username}`.trim();
}

function getChatName(ctx) {
  const chat = ctx.message?.chat;
  if (!chat) return "Chat necunoscut";
  if (chat.type === "private") return "Private chat";
  return chat.title || "Grup necunoscut";
}

function getForwardedFrom(ctx) {
  const origin = ctx.message?.forward_origin;
  if (!origin) return "Nu este mesaj forwardat";

  if (origin.type === "user") {
    const user = origin.sender_user;
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }

  if (origin.type === "chat") return origin.chat.title || "Chat necunoscut";
  if (origin.type === "channel") return origin.chat.title || "Canal necunoscut";

  return "Sursă necunoscută";
}

function hasSupportedImage(ctx) {
  return Boolean(
    ctx.message?.photo?.length ||
      ctx.message?.document?.mime_type?.startsWith("image/")
  );
}

async function getTelegramImageUrl(ctx) {
  if (ctx.message?.photo?.length) {
    const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
    return fileLink.href;
  }

  const doc = ctx.message?.document;

  if (doc && doc.mime_type?.startsWith("image/")) {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    return fileLink.href;
  }

  return null;
}

async function uploadTelegramImageToCloudinary(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
  });

  const mimeType = response.headers["content-type"] || "image/jpeg";
  const base64Image = Buffer.from(response.data).toString("base64");
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "telegram-github-bot",
    resource_type: "image",
  });

  return result.secure_url;
}

async function createIssue(title, body) {
  const repositoryId = await getRepositoryId();

  const result = await github(
    `
    mutation($repositoryId: ID!, $title: String!, $body: String!) {
      createIssue(input: {
        repositoryId: $repositoryId,
        title: $title,
        body: $body
      }) {
        issue {
          id
          number
          title
          url
        }
      }
    }
    `,
    {
      repositoryId,
      title,
      body,
    }
  );

  return result.createIssue.issue;
}

async function addIssueToProject(issueId) {
  const result = await github(
    `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId,
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
    `,
    {
      projectId: process.env.PROJECT_ID,
      contentId: issueId,
    }
  );

  return result.addProjectV2ItemById.item.id;
}

async function setStatusToBacklog(itemId) {
  await github(
    `
    mutation(
      $projectId: ID!,
      $itemId: ID!,
      $fieldId: ID!,
      $optionId: String!
    ) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: {
          singleSelectOptionId: $optionId
        }
      }) {
        projectV2Item {
          id
        }
      }
    }
    `,
    {
      projectId: process.env.PROJECT_ID,
      itemId,
      fieldId: process.env.STATUS_FIELD_ID,
      optionId: process.env.BACKLOG_OPTION_ID,
    }
  );
}

async function createBacklogTask(ctx) {
  const text = getTaskText(ctx);
  const senderName = getSenderName(ctx);
  const chatName = getChatName(ctx);
  const forwardedFrom = getForwardedFrom(ctx);
  const telegramImageUrl = await getTelegramImageUrl(ctx);

  let publicImageUrl = null;

  if (telegramImageUrl) {
    publicImageUrl = await uploadTelegramImageToCloudinary(telegramImageUrl);
  }

  const titlePrefix = chatName !== "Private chat" ? `[${chatName}] ` : "";
  const title = cleanTitle(`${titlePrefix}${text || "Imagine trimisă"}`);

  const issueBody = `Chat: ${chatName}
Sent by: ${senderName}
Forwarded from: ${forwardedFrom}

💬Original message:💬
${text || "Fără text"}

${publicImageUrl ? `<img width="884" alt="Image" src="${publicImageUrl}" />` : ""}`;

  const issue = await createIssue(title, issueBody);

  const itemId = await addIssueToProject(issue.id);
  await setStatusToBacklog(itemId);

  return {
    issue,
    senderName,
    chatName,
    forwardedFrom,
    publicImageUrl,
  };
}

function startCombineSession(ctx) {
  const chatKey = getChatKey(ctx);

  combineSessions.set(chatKey, {
    chatId: ctx.chat.id,
    chatName: getChatName(ctx),
    startedBy: getSenderName(ctx),
    items: [],
    creating: false,
  });
}

function cancelCombineSession(ctx) {
  const chatKey = getChatKey(ctx);
  combineSessions.delete(chatKey);
}

async function addMessageToCombineSession(ctx) {
  const chatKey = getChatKey(ctx);
  const session = combineSessions.get(chatKey);

  if (!session || session.creating) return false;

  const text = getTaskText(ctx);
  const telegramImageUrl = await getTelegramImageUrl(ctx);

  session.items.push({
    text,
    senderName: getSenderName(ctx),
    chatName: getChatName(ctx),
    forwardedFrom: getForwardedFrom(ctx),
    telegramImageUrl,
    hasImage: hasSupportedImage(ctx),
  });

  return true;
}

async function createCombinedBacklogTask(ctx) {
  const chatKey = getChatKey(ctx);
  const session = combineSessions.get(chatKey);

  if (!session || session.items.length === 0 || session.creating) {
    return null;
  }

  session.creating = true;

  const preparedItems = [];

  for (let i = 0; i < session.items.length; i++) {
    const item = session.items[i];

    let publicImageUrl = null;

    if (item.telegramImageUrl) {
      try {
        publicImageUrl = await uploadTelegramImageToCloudinary(
          item.telegramImageUrl
        );
      } catch (error) {
        console.error(`Image upload failed ${i + 1}:`, error);
      }
    }

    preparedItems.push({
      ...item,
      publicImageUrl,
    });
  }

  const firstTextItem = preparedItems.find((item) => item.text);
  const titleText = firstTextItem?.text || "Imagini combinate";
  const title = cleanTitle(`[${session.chatName}] ${titleText}`);

  const issueBody = `Chat: ${session.chatName}
Started by: ${session.startedBy}
Combined messages: ${preparedItems.length}

${preparedItems
  .map((item, index) => {
    return `--- Message ${index + 1} ---
Sent by: ${item.senderName}
Forwarded from: ${item.forwardedFrom}
Has image: ${item.publicImageUrl ? "Da" : "Nu"}

💬Original message:💬
${item.text || "Fără text"}

${item.publicImageUrl ? `<img width="884" alt="Image" src="${item.publicImageUrl}" />` : ""}`;
  })
  .join("\n\n")}`;

  const issue = await createIssue(title, issueBody);

  const itemId = await addIssueToProject(issue.id);
  await setStatusToBacklog(itemId);

  combineSessions.delete(chatKey);

  return issue;
}

bot.start((ctx) => {
  ctx.reply(
    "Bot activ ✅\n\nFără /combine creez task separat. Cu /combine adun mesajele, iar /stop creează taskul combinat."
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "Fără /combine: fiecare mesaj/imagine devine task separat.\n\nCu /combine:\n1. Scrie /combine\n2. Forwardează mesaje/imagini\n3. Scrie /stop ca să creez 1 task combinat\n\nDacă vrei să anulezi combinarea fără task, scrie /cancel."
  );
});

bot.on(["text", "photo", "document"], async (ctx) => {
  const rawText = getTaskText(ctx);
  const hasImage = hasSupportedImage(ctx);
  const normalizedText = rawText.toLowerCase().trim();

  if (ctx.message?.from?.is_bot) return;

  if (normalizedText === "/combin" || normalizedText === "/combine") {
    startCombineSession(ctx);

    return ctx.reply(
      "📌 Mod combinare activat.\nForwardează textele/imaginile, apoi scrie /stop ca să creez 1 task în Backlog."
    );
  }

  if (normalizedText === "/cancel" ||
      normalizedText === "/cancel@kanbantask_bot"
       ) {
    cancelCombineSession(ctx);
    return ctx.reply("🛑 Combinarea a fost anulată. Nu am creat task.");
  }

  if (normalizedText === "/stop" ||
      normalizedText === "/stop@kanbantask_bot"
      ) {
    try {
      const issue = await createCombinedBacklogTask(ctx);

      if (!issue) {
        cancelCombineSession(ctx);
        return ctx.reply("⚠️ Nu există mesaje/imagini pentru combinare.");
      }

      return ctx.reply(
        `✅ Task combinat adăugat în Backlog:\n\n#${issue.number} ${issue.title}\n\n${issue.url}`
      );
    } catch (error) {
      console.error("Combine stop error:", error);
      cancelCombineSession(ctx);
      return ctx.reply("❌ Eroare la crearea taskului combinat.");
    }
  }

  if (!rawText && !hasImage) return;

  try {
    const addedToCombine = await addMessageToCombineSession(ctx);

    if (addedToCombine) {
      const chatKey = getChatKey(ctx);
      const session = combineSessions.get(chatKey);

      return ctx.reply(
        `➕ Adăugat în taskul combinat.\nTotal elemente: ${session.items.length}`
      );
    }

    if (rawText.startsWith("/")) return;

    const { issue, senderName, chatName, publicImageUrl } =
      await createBacklogTask(ctx);

    await ctx.reply(
      `✅ Task adăugat în Backlog:\n\n#${issue.number} ${issue.title}\n👤 De la: ${senderName}\n💬 Chat: ${chatName}${publicImageUrl ? "\n🖼 Imagine afișată în task" : ""}\n\n${issue.url}`
    );
  } catch (error) {
    console.error("GitHub/Telegram error:", error);

    await ctx.reply(
      "❌ Eroare la crearea taskului. Verifică tokenurile GitHub, Telegram și Cloudinary."
    );
  }
});

bot.on("message", async () => {
  return;
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => resolve(body));
    req.on("error", (error) => reject(error));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Telegram bot webhook is running ✅");
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Method Not Allowed");
    }

    const rawBody = await readRequestBody(req);
    const update = JSON.parse(rawBody || "{}");

    await bot.handleUpdate(update);

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("OK");
  } catch (error) {
    console.error("Webhook server error:", error);

    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Internal Server Error");
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
