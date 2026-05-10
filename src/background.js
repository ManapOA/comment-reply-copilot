const DEFAULT_SETTINGS = {
  // Origin: github.com/ManapOA/comment-reply-copilot
  provider: "openai",
  model: "gpt-5.4-mini",
  openaiModel: "gpt-5.4-mini",
  geminiModel: "gemini-2.5-flash",
  anthropicModel: "claude-sonnet-4-20250514",
  brandVoice:
    "Warm, grateful, short, human. Avoid sounding like spam. Never make promises or medical/legal/financial claims.",
  maxWords: 35,
  replyLanguage: "auto",
  previewLanguage: "browser"
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...compact(existing) });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CCR_GENERATE_REPLY") {
    return false;
  }

  generateReply(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function generateReply(payload) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.local.get([
      "apiKey",
      "openaiApiKey",
      "geminiApiKey",
      "anthropicApiKey",
      "provider",
      "model",
      "openaiModel",
      "geminiModel",
      "anthropicModel",
      "brandVoice",
      "maxWords",
      "replyLanguage",
      "previewLanguage"
    ]))
  };

  const provider = settings.provider || DEFAULT_SETTINGS.provider;
  const apiKey = getProviderApiKey(settings, provider);

  if (!apiKey) {
    throw new Error(`Add your ${providerLabel(provider)} API key in the extension settings first.`);
  }

  if (provider === "gemini") {
    return requestGemini({ settings, apiKey, payload });
  }

  if (provider === "anthropic") {
    return requestAnthropic({ settings, apiKey, payload });
  }

  return requestOpenAI({ settings, apiKey, payload });
}

async function requestOpenAI({ settings, apiKey, payload }) {
  const prompt = buildPrompt(settings, payload);
  const body = {
    model: settings.openaiModel || settings.model || DEFAULT_SETTINGS.openaiModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: prompt.system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt.user }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "comment_reply",
        strict: true,
        schema: replySchema()
      }
    },
    max_output_tokens: 800
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || "OpenAI request failed.");
  }

  return parseReplyText(extractOpenAIText(data));
}

async function requestGemini({ settings, apiKey, payload }) {
  const prompt = buildPrompt(settings, payload);
  const model = encodeURIComponent(settings.geminiModel || DEFAULT_SETTINGS.geminiModel);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt.system}\n\n${prompt.user}` }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 800
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || "Gemini request failed.");
  }

  const text = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  return parseReplyText(text);
}

async function requestAnthropic({ settings, apiKey, payload }) {
  const prompt = buildPrompt(settings, payload);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.anthropicModel || DEFAULT_SETTINGS.anthropicModel,
      max_tokens: 800,
      system: prompt.system,
      messages: [
        {
          role: "user",
          content: prompt.user
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || "Anthropic request failed.");
  }

  const text = (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  return parseReplyText(text);
}

function buildPrompt(settings, payload) {
  const previewLanguage = resolvePreviewLanguage(settings.previewLanguage);

  return {
    system: [
      "You help a creator answer high-volume YouTube Studio comments.",
      "Return only a complete valid JSON object with keys: reply, preview, detectedLanguage, note. No markdown, no code fences, no partial JSON.",
      "reply: the exact comment reply to publish. Use the commenter's language when requested reply language is auto; otherwise use the requested reply language.",
      `preview: natural translation/explanation of reply in ${previewLanguage} so the creator understands it.`,
      `detectedLanguage: detected comment language name in ${previewLanguage}.`,
      `note: brief note in ${previewLanguage} if the comment is unclear, sensitive, insulting, or should not be answered.`,
      "Be kind, concise, specific to the comment, and safe.",
      "If the comment is only emoji, mostly emoji, or a tiny positive reaction, reply with a short matching warm reaction: one short phrase or 1-3 friendly emoji. Do not invent a topic.",
      "If commentStyle is emoji_only, reply must contain only 1-3 friendly emoji and no words. Example reply: '😊🙏'.",
      "If commentStyle is mostly_emoji, reply should be at most 3 words plus emoji.",
      "Use context only to avoid mistakes; never answer the video title instead of the comment.",
      "Do not use hashtags. Do not ask for likes/subscriptions unless the original comment asks about it.",
      `Creator voice: ${settings.brandVoice}`,
      `Maximum reply length: ${Number(settings.maxWords) || DEFAULT_SETTINGS.maxWords} words.`,
      `Requested reply language: ${settings.replyLanguage || "auto"}.`,
      `Preview language: ${previewLanguage}.`
    ].join("\n"),
    user: JSON.stringify(
      {
        author: payload.author || "",
        comment: payload.comment || "",
        commentStyle: payload.commentStyle || "",
        context: payload.context || "",
        pageTitle: payload.pageTitle || ""
      },
      null,
      2
    )
  };
}

function extractOpenAIText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function parseReplyText(text) {
  if (!text) {
    throw new Error("The provider returned an empty response.");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return normalizeReply(JSON.parse(cleaned));
  } catch {
    const recovered = recoverReplyObject(cleaned);
    if (recovered) {
      return normalizeReply(recovered);
    }

    if (looksLikeBrokenJson(cleaned)) {
      throw new Error("Provider returned broken JSON. Try again or use another model/provider.");
    }

    return {
      reply: cleaned,
      preview: "Parser could not read the preview. Review the reply manually.",
      detectedLanguage: "Unknown",
      note: ""
    };
  }
}

function recoverReplyObject(text) {
  const objectText = extractFirstJsonObject(text);
  if (objectText) {
    try {
      return JSON.parse(objectText);
    } catch {
      // Continue to regex recovery below.
    }
  }

  const reply = matchJsonStringValue(text, "reply");
  if (!reply) {
    return null;
  }

  return {
    reply,
    preview: matchJsonStringValue(text, "preview") || matchJsonStringValue(text, "russian") || reply,
    detectedLanguage: matchJsonStringValue(text, "detectedLanguage") || "Unknown",
    note: matchJsonStringValue(text, "note") || ""
  };
}

function looksLikeBrokenJson(text) {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("{") ||
    trimmed.includes('"reply"') ||
    trimmed.includes('"preview"') ||
    trimmed.includes('"russian"') ||
    trimmed.includes('"detectedLanguage"')
  );
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return text.slice(start, end + 1);
}

function matchJsonStringValue(text, key) {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!match) {
    return "";
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function normalizeReply(value) {
  return {
    reply: String(value.reply || "").trim(),
    preview: String(value.preview || value.russian || "").trim(),
    detectedLanguage: String(value.detectedLanguage || "").trim(),
    note: String(value.note || "").trim()
  };
}

function replySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      preview: { type: "string" },
      detectedLanguage: { type: "string" },
      note: { type: "string" }
    },
    required: ["reply", "preview", "detectedLanguage", "note"]
  };
}

function resolvePreviewLanguage(value) {
  if (!value || value === "browser") {
    const locale = chrome.i18n?.getUILanguage?.() || "en";
    return `the user's browser language (${locale})`;
  }

  if (value === "reply") {
    return "the same language as the reply";
  }

  return value;
}

function getProviderApiKey(settings, provider) {
  if (provider === "gemini") {
    return settings.geminiApiKey;
  }

  if (provider === "anthropic") {
    return settings.anthropicApiKey;
  }

  return settings.openaiApiKey || settings.apiKey;
}

function providerLabel(provider) {
  return (
    {
      openai: "OpenAI",
      gemini: "Gemini",
      anthropic: "Anthropic"
    }[provider] || provider
  );
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
