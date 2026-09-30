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

function getForwardedFrom(ctx) {
  const origin = ctx.message?.forward_origin;

  if (!origin) return "Nu este mesaj forwardat";

  if (origin.type === "user") {
    const user = origin.sender_user;
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }

  if (origin.type === "chat") {
    return origin.chat.title || "Chat necunoscut";
  }

  if (origin.type === "channel") {
    return origin.chat.title || "Canal necunoscut";
  }

  return "Sursă necunoscută";
}

async function getTelegramPhotoUrl(ctx) {
  const photos = ctx.message?.photo;

  if (!photos || photos.length === 0) return null;

  const largestPhoto = photos[photos.length - 1];
  const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);

  return fileLink.href;
}

async function uploadTelegramImageToCloudinary(photoUrl) {
  const response = await axios.get(photoUrl, {
    responseType: "arraybuffer",
  });

  const base64Image = Buffer.from(response.data).toString("base64");
  const dataUri = `data:image/jpeg;base64,${base64Image}`;

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

async function addCommentToIssue(issueId, body) {
  await github(
    `
    mutation($issueId: ID!, $body: String!) {
      addComment(input: {
        subjectId: $issueId,
        body: $body
      }) {
        commentEdge {
          node {
            id
          }
        }
      }
    }
    `,
    {
      issueId,
      body,
    }
  );
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
  const hasPhoto = Boolean(ctx.message?.photo?.length);

  const title = cleanTitle(text || "Imagine forwardată");
  const forwardedFrom = getForwardedFrom(ctx);
  const telegramPhotoUrl = await getTelegramPhotoUrl(ctx);

  const issueBody = `Forwarded from: ${forwardedFrom}

Original message:
${text || "Fără text"}`;

  const issue = await createIssue(title, issueBody);

  let publicImageUrl = null;

  if (telegramPhotoUrl) {
    publicImageUrl = await uploadTelegramImageToCloudinary(telegramPhotoUrl);

    const imageComment = `<img width="884" alt="Image" src="${publicImageUrl}" />`;

    await addCommentToIssue(issue.id, imageComment);
  }

  const itemId = await addIssueToProject(issue.id);
  await setStatusToBacklog(itemId);

  return {
    issue,
    forwardedFrom,
    publicImageUrl,
    hasPhoto,
  };
}

bot.start((ctx) => {
  ctx.reply(
    "Bot activ ✅\n\nTrimite sau forwardează text/poză, iar eu creez task în GitHub Backlog."
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "Trimite text sau forwardează o poză cu/fără caption. Botul creează issue în GitHub, îl pune în Backlog și adaugă imaginea direct în comentariu."
  );
});

bot.on(["text", "photo"], async (ctx) => {
  const rawText = getTaskText(ctx);
  const hasPhoto = Boolean(ctx.message?.photo?.length);

  if (rawText.startsWith("/")) return;

  if (!rawText && !hasPhoto) {
    return ctx.reply("⚠️ Mesajul nu conține text sau poză.");
  }

  try {
    await ctx.reply("⏳ Creez task în Backlog...");

    const { issue, forwardedFrom, publicImageUrl } =
      await createBacklogTask(ctx);

    await ctx.reply(
      `✅ Task adăugat în Backlog:\n\n#${issue.number} ${issue.title}\n📨 Forwarded from: ${forwardedFrom}${publicImageUrl ? "\n🖼 Imagine afișată în comentariu" : ""}\n\n${issue.url}`
    );
  } catch (error) {
    console.error("GitHub/Telegram error:", error);

    await ctx.reply(
      "❌ Eroare la crearea taskului. Verifică tokenurile GitHub, Telegram și Cloudinary."
    );
  }
});

bot.on("message", async (ctx) => {
  await ctx.reply("⚠️ Mesaj nesuportat. Trimite text sau poză.");
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).send("Telegram bot webhook is running ✅");
    }

    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    await bot.handleUpdate(req.body);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Vercel webhook error:", error);
    return res.status(500).send("Internal Server Error");
  }
}
