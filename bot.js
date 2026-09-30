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

function getChatKey(ctx) {
  return String(ctx.message?.chat?.id || ctx.chat?.id || "default");
}

function getSenderName(ctx) {
  const user = ctx.message?.from;
  if (!user) return "Unknown user";

  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  const username = user.username ? `@${user.username}` : "";

  return `${fullName || "No name"} ${username}`.trim();
}

function getChatName(ctx) {
  const chat = ctx.message?.chat;
  if (!chat) return "Unknown chat";
  if (chat.type === "private") return "Private chat";
  return chat.title || "Unknown group";
}

function getForwardedFrom(ctx) {
  const origin = ctx.message?.forward_origin;

  if (!origin) return "Not a forwarded message";

  if (origin.type === "user") {
    const user = origin.sender_user;
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }

  if (origin.type === "chat") {
    return origin.chat.title || "Unknown chat";
  }

  if (origin.type === "channel") {
    return origin.chat.title || "Unknown channel";
  }

  return "Unknown source";
}

function hasSupportedImage(ctx) {
  return Boolean(
    ctx.message?.photo?.length ||
      ctx.message?.document?.mime_type?.startsWith("image/")
  );
}

function isCommand(text, names) {
  const normalized = (text || "").toLowerCase().trim();
  const base = normalized.split("@")[0];
  return names.some((name) => base === name || normalized === name);
}

function sessionMarker(chatKey) {
  return `[combine-session:${chatKey}]`;
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

async function addCommentToIssue(issueId, body) {
  const result = await github(
    `
    mutation($issueId: ID!, $body: String!) {
      addComment(input: {
        subjectId: $issueId,
        body: $body
      }) {
        commentEdge {
          node {
            id
            body
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

  return result.addComment.commentEdge.node;
}

async function closeIssue(issueId) {
  await github(
    `
    mutation($issueId: ID!) {
      closeIssue(input: { issueId: $issueId }) {
        issue {
          id
        }
      }
    }
    `,
    { issueId }
  );
}

async function findOpenCombineSession(chatKey) {
  const marker = sessionMarker(chatKey);
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  const data = await github(
    `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(
          first: 20
          states: OPEN
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes {
            id
            number
            title
            body
            comments(first: 50) {
              nodes {
                body
              }
            }
          }
        }
      }
    }
    `,
    {
      owner,
      repo,
    }
  );

  const issues = data.repository.issues.nodes || [];
  return issues.find((issue) => issue.title.includes(marker)) || null;
}

async function startCombineSession(ctx) {
  const chatKey = getChatKey(ctx);
  const chatName = getChatName(ctx);
  const startedBy = getSenderName(ctx);
  const marker = sessionMarker(chatKey);

  const existing = await findOpenCombineSession(chatKey);
  if (existing) {
    await closeIssue(existing.id);
  }

  const issue = await createIssue(
    `🔄 ${marker}`,
    `Chat: ${chatName}\nStarted by: ${startedBy}\n\n_Temporary combine session – will be closed on /stop or /cancel._`
  );

  return issue;
}

async function cancelCombineSession(ctx) {
  const chatKey = getChatKey(ctx);
  const existing = await findOpenCombineSession(chatKey);

  if (existing) {
    await closeIssue(existing.id);
    return true;
  }

  return false;
}

async function addMessageToCombineSession(ctx) {
  const chatKey = getChatKey(ctx);
  const session = await findOpenCombineSession(chatKey);

  if (!session) return null;

  const text = getTaskText(ctx);
  const telegramImageUrl = await getTelegramImageUrl(ctx);

  let publicImageUrl = null;
  if (telegramImageUrl) {
    try {
      publicImageUrl = await uploadTelegramImageToCloudinary(telegramImageUrl);
    } catch (error) {
      console.error("Image upload failed:", error);
    }
  }

  const item = {
    text: text || "",
    senderName: getSenderName(ctx),
    chatName: getChatName(ctx),
    forwardedFrom: getForwardedFrom(ctx),
    publicImageUrl,
  };

  await addCommentToIssue(session.id, "```json\n" + JSON.stringify(item) + "\n```");

  const itemCount = (session.comments?.nodes?.length || 0) + 1;
  return itemCount;
}

async function createCombinedBacklogTask(ctx) {
  const chatKey = getChatKey(ctx);
  const session = await findOpenCombineSession(chatKey);

  if (!session) return null;

  const comments = session.comments?.nodes || [];
  const preparedItems = [];

  for (const comment of comments) {
    try {
      const match = comment.body.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        preparedItems.push(JSON.parse(match[1]));
      }
    } catch (error) {
      console.error("Failed to parse combine item:", error);
    }
  }

  if (preparedItems.length === 0) {
    await closeIssue(session.id);
    return null;
  }

  const chatName = preparedItems[0]?.chatName || getChatName(ctx);
  const startedBy = getSenderName(ctx);
  const firstTextItem = preparedItems.find((item) => item.text);
  const titleText = firstTextItem?.text || "Combined images";
  const title = cleanTitle(`[${chatName}] ${titleText}`);

  const issueBody = `Chat: ${chatName}
Started by: ${startedBy}
Combined messages: ${preparedItems.length}

${preparedItems
  .map((item, index) => {
    return `--- Message ${index + 1} ---
Sent by: ${item.senderName}
Forwarded from: ${item.forwardedFrom}
Has image: ${item.publicImageUrl ? "Yes" : "No"}

Original message:
${item.text || "No text"}

${item.publicImageUrl ? '<img width="884" alt="Image" src="' + item.publicImageUrl + '" />' : ""}`;
  })
  .join("\n\n")}`;

  const issue = await createIssue(title, issueBody);

  const itemId = await addIssueToProject(issue.id);
  await setStatusToBacklog(itemId);

  await closeIssue(session.id);

  return issue;
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
  const title = cleanTitle(`${titlePrefix}${text || "Image sent"}`);

  const issueBody = `Chat: ${chatName}
Sent by: ${senderName}
Forwarded from: ${forwardedFrom}

Original message:
${text || "No text"}

${publicImageUrl ? '<img width="884" alt="Image" src="' + publicImageUrl + '" />' : ""}`;

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

bot.start((ctx) => {
  ctx.reply(
    "Bot active ✅\n\nWithout /combine each message becomes a separate task.\nWith /combine I collect messages, then /stop creates one combined task."
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "Without /combine: each message/image becomes a separate task.\n\nWith /combine:\n1. Send /combine\n2. Forward messages/images\n3. Send /stop to create 1 combined task\n\nTo cancel without creating a task, send /cancel."
  );
});

bot.on(["text", "photo", "document"], async (ctx) => {
  const rawText = getTaskText(ctx);
  const hasImage = hasSupportedImage(ctx);

  if (ctx.message?.from?.is_bot) return;

  if (isCommand(rawText, ["/combine", "/combin"])) {
    try {
      await startCombineSession(ctx);
      return ctx.reply(
        "📌 Combine mode enabled.\nForward texts/images, then send /stop to create 1 task in Backlog."
      );
    } catch (error) {
      console.error("Combine start error:", error);
      return ctx.reply("❌ Error starting combine mode.");
    }
  }

  if (isCommand(rawText, ["/cancel"])) {
    try {
      const cancelled = await cancelCombineSession(ctx);
      if (cancelled) {
        return ctx.reply("🛑 Combine cancelled. No task was created.");
      }
      return ctx.reply("⚠️ No active combine session.");
    } catch (error) {
      console.error("Combine cancel error:", error);
      return ctx.reply("❌ Error cancelling combine mode.");
    }
  }

  if (isCommand(rawText, ["/stop"])) {
    try {
      await ctx.reply("⏳ Creating combined task...");
      const issue = await createCombinedBacklogTask(ctx);

      if (!issue) {
        return ctx.reply("⚠️ No messages/images to combine. Send /combine first.");
      }

      return ctx.reply(
        `✅ Combined task added to Backlog:\n\n#${issue.number} ${issue.title}\n\n${issue.url}`
      );
    } catch (error) {
      console.error("Combine stop error:", error);
      return ctx.reply("❌ Error creating combined task.");
    }
  }

  if (!rawText && !hasImage) return;

  try {
    const itemCount = await addMessageToCombineSession(ctx);

    if (itemCount !== null) {
      return ctx.reply(
        `➕ Added to combined task.\nTotal items: ${itemCount}`
      );
    }

    if (rawText.startsWith("/")) return;

    const { issue, senderName, chatName, publicImageUrl } =
      await createBacklogTask(ctx);

    await ctx.reply(
      `✅ Task added to Backlog:\n\n#${issue.number} ${issue.title}\n👤 From: ${senderName}\n💬 Chat: ${chatName}${publicImageUrl ? "\n🖼 Image shown in task" : ""}\n\n${issue.url}`
    );
  } catch (error) {
    console.error("GitHub/Telegram error:", error);

    await ctx.reply(
      "❌ Error creating task. Check GitHub, Telegram and Cloudinary tokens."
    );
  }
});

bot.on("message", async () => {
  return;
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
