const DEFAULT_SETTINGS = {
  // Origin: github.com/ManapOA/comment-reply-copilot
  provider: "openai",
  model: "gpt-5.4-mini",
  openaiModel: "gpt-5.4-mini",
  geminiModel: "gemini-2.5-flash",
  anthropicModel: "claude-sonnet-4-20250514",
  groqModel: "llama-3.1-8b-instant",
  openrouterModel: "google/gemini-2.5-flash-lite",
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
  if (message?.type === "CCR_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "CCR_GENERATE_REPLY") {
    generateReply(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  if (message?.type === "CCR_REWRITE_REPLY") {
    rewriteReply(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  }

  return false;
});

async function loadSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.local.get([
      "apiKey",
      "openaiApiKey",
      "geminiApiKey",
      "anthropicApiKey",
      "groqApiKey",
      "openrouterApiKey",
      "provider",
      "model",
      "openaiModel",
      "geminiModel",
      "anthropicModel",
      "groqModel",
      "openrouterModel",
      "brandVoice",
      "maxWords",
      "replyLanguage",
      "previewLanguage"
    ]))
  };
}

async function withProvider(callback) {
  const settings = await loadSettings();
  const provider = settings.provider || DEFAULT_SETTINGS.provider;
  const apiKey = getProviderApiKey(settings, provider);

  if (!apiKey) {
    throw new Error(`Add your ${providerLabel(provider)} API key in the extension settings first.`);
  }

  return callback({ settings, provider, apiKey });
}

async function generateReply(payload) {
  return withProvider(({ settings, provider, apiKey }) => {
    if (provider === "gemini") {
      return requestGemini({ settings, apiKey, payload });
    }

    if (provider === "anthropic") {
      return requestAnthropic({ settings, apiKey, payload });
    }

    if (provider === "groq") {
      return requestGroq({ settings, apiKey, payload });
    }

    if (provider === "openrouter") {
      return requestOpenRouter({ settings, apiKey, payload });
    }

    return requestOpenAI({ settings, apiKey, payload });
  });
}

async function rewriteReply(payload) {
  return withProvider(({ settings, provider, apiKey }) => {
    if (!payload?.editedPreview?.trim()) {
      throw new Error("Edited preview is empty.");
    }

    if (provider === "gemini") {
      return requestGeminiRewrite({ settings, apiKey, payload });
    }

    if (provider === "anthropic") {
      return requestAnthropicRewrite({ settings, apiKey, payload });
    }

    if (provider === "groq") {
      return requestGroqRewrite({ settings, apiKey, payload });
    }

    if (provider === "openrouter") {
      return requestOpenRouterRewrite({ settings, apiKey, payload });
    }

    return requestOpenAIRewrite({ settings, apiKey, payload });
  });
}

async function requestOpenAIRewrite({ settings, apiKey, payload }) {
  const prompt = buildRewritePrompt(settings, payload);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
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
          name: "comment_reply_rewrite",
          strict: true,
          schema: rewriteSchema()
        }
      },
      max_output_tokens: 300
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || "OpenAI request failed.");
  }

  return parseRewriteText(extractOpenAIText(data));
}

async function requestGeminiRewrite({ settings, apiKey, payload }) {
  const prompt = buildRewritePrompt(settings, payload);
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
          maxOutputTokens: 300
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

  return parseRewriteText(text);
}

async function requestAnthropicRewrite({ settings, apiKey, payload }) {
  const prompt = buildRewritePrompt(settings, payload);
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
      max_tokens: 300,
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

  return parseRewriteText(text);
}

async function requestGroqRewrite({ settings, apiKey, payload }) {
  const prompt = buildRewritePrompt(settings, payload);
  const text = await requestOpenAICompatibleChat({
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    model: settings.groqModel || DEFAULT_SETTINGS.groqModel,
    prompt,
    maxTokens: 300,
    providerName: "Groq"
  });

  return parseRewriteText(text);
}

async function requestOpenRouterRewrite({ settings, apiKey, payload }) {
  const prompt = buildRewritePrompt(settings, payload);
  const text = await requestOpenAICompatibleChat({
    apiKey,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: settings.openrouterModel || DEFAULT_SETTINGS.openrouterModel,
    prompt,
    maxTokens: 300,
    providerName: "OpenRouter",
    extraHeaders: openRouterHeaders()
  });

  return parseRewriteText(text);
}

function buildRewritePrompt(settings, payload) {
  const previewLanguage = resolvePreviewLanguage(settings.previewLanguage);

  return {
    system: [
      "You rewrite a YouTube comment reply based on the creator's edited preview text.",
      "Return only a complete valid JSON object with keys: reply, preview. No markdown, no code fences.",
      "reply: the exact comment reply to publish.",
      `preview: the same meaning as reply in ${previewLanguage}.`,
      "Treat editedPreview as the creator's manual intended answer, usually written in the preview/interface language.",
      "Translate and adapt editedPreview into the target reply language while preserving the creator's meaning exactly.",
      "Use the commenter's detected language when requested reply language is auto; otherwise use the requested reply language.",
      "Do not answer in Russian unless the target reply language is Russian or the comment is Russian.",
      "Avoid repetitive generic openings. Keep the creator's phrasing fresh and natural.",
      "Keep it kind, concise, specific, and safe.",
      "Do not add hashtags or asks for likes/subscriptions unless editedPreview explicitly asks for that.",
      `Maximum reply length: ${Number(settings.maxWords) || DEFAULT_SETTINGS.maxWords} words.`,
      `Requested reply language: ${settings.replyLanguage || "auto"}.`,
      `Preview language: ${previewLanguage}.`
    ].join("\n"),
    user: JSON.stringify(
      {
        author: payload.author || "",
        comment: payload.comment || "",
        commentPreview: payload.commentPreview || "",
        currentReply: payload.currentReply || "",
        editedPreview: payload.editedPreview || "",
        detectedLanguage: payload.detectedLanguage || "",
        pageTitle: payload.pageTitle || "",
        videoTitle: payload.videoTitle || "",
        videoContext: payload.videoContext || ""
      },
      null,
      2
    )
  };
}

function parseRewriteText(text) {
  if (!text) {
    throw new Error("The provider returned an empty response.");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return normalizeRewrite(JSON.parse(cleaned));
  } catch {
    const objectText = extractFirstJsonObject(cleaned);
    if (objectText) {
      try {
        return normalizeRewrite(JSON.parse(objectText));
      } catch {
        // Continue to regex recovery below.
      }
    }

    const reply = matchJsonStringValue(cleaned, "reply");
    if (reply) {
      return {
        reply,
        preview: matchJsonStringValue(cleaned, "preview") || ""
      };
    }

    if (looksLikeBrokenJson(cleaned)) {
      throw new Error("Provider returned broken JSON. Try again or use another model/provider.");
    }

    return { reply: cleaned, preview: "" };
  }
}

function normalizeRewrite(value) {
  return {
    reply: String(value.reply || "").trim(),
    preview: String(value.preview || value.russian || "").trim()
  };
}

function rewriteSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      preview: { type: "string" }
    },
    required: ["reply", "preview"]
  };
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

async function requestGroq({ settings, apiKey, payload }) {
  const prompt = buildPrompt(settings, payload);
  const text = await requestOpenAICompatibleChat({
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    model: settings.groqModel || DEFAULT_SETTINGS.groqModel,
    prompt,
    maxTokens: 800,
    providerName: "Groq"
  });

  return parseReplyText(text);
}

async function requestOpenRouter({ settings, apiKey, payload }) {
  const prompt = buildPrompt(settings, payload);
  const text = await requestOpenAICompatibleChat({
    apiKey,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: settings.openrouterModel || DEFAULT_SETTINGS.openrouterModel,
    prompt,
    maxTokens: 800,
    providerName: "OpenRouter",
    extraHeaders: openRouterHeaders()
  });

  return parseReplyText(text);
}

async function requestOpenAICompatibleChat({
  apiKey,
  baseUrl,
  model,
  prompt,
  maxTokens,
  providerName,
  extraHeaders = {}
}) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      temperature: 0.8
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || response.statusText || `${providerName} request failed.`);
  }

  return (data.choices || [])
    .map((choice) => choice.message?.content || choice.text || "")
    .join("\n")
    .trim();
}

function openRouterHeaders() {
  return {
    "HTTP-Referer": "https://github.com/ManapOA/comment-reply-copilot",
    "X-Title": "TubeReply"
  };
}

function buildPrompt(settings, payload) {
  const previewLanguage = resolvePreviewLanguage(settings.previewLanguage);

  return {
    system: [
      "You help a creator answer high-volume YouTube Studio comments.",
      "Return only a complete valid JSON object with keys: commentPreview, reply, preview, detectedLanguage, note. No markdown, no code fences, no partial JSON.",
      `commentPreview: natural translation/explanation of the user's original comment in ${previewLanguage}.`,
      "reply: the exact comment reply to publish. Use the commenter's language when requested reply language is auto; otherwise use the requested reply language.",
      `preview: natural translation/explanation of reply in ${previewLanguage} so the creator understands it.`,
      `detectedLanguage: detected comment language name in ${previewLanguage}.`,
      `note: brief note in ${previewLanguage} if the comment is unclear, sensitive, insulting, or should not be answered.`,
      "If requested reply language is auto, the reply must be in the detected language of the comment, not in the preview/interface language.",
      "If the comment is in a non-Russian language, do not reply in Russian unless the requested reply language is Russian.",
      "Avoid repetitive generic openings like 'Thanks for stopping by', 'Thanks for confirming', and their translations.",
      "Vary wording naturally: use direct appreciation, a short relevant reaction, or a small follow-up depending on the comment.",
      "Use videoTitle and videoContext to understand the video's topic and make the reply feel relevant.",
      "If the comment is positive or open-ended and the topic is clear, you may include one short engaging question about the video topic.",
      "Do not force a question when the comment is emoji-only, unclear, negative, sensitive, or when a question would sound unnatural.",
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
        pageTitle: payload.pageTitle || "",
        videoTitle: payload.videoTitle || "",
        videoContext: payload.videoContext || ""
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
      commentPreview: "",
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
    commentPreview:
      matchJsonStringValue(text, "commentPreview") ||
      matchJsonStringValue(text, "commentTranslation") ||
      matchJsonStringValue(text, "translatedComment") ||
      "",
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
    trimmed.includes('"commentPreview"') ||
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
    commentPreview: String(value.commentPreview || value.commentTranslation || value.translatedComment || "").trim(),
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
      commentPreview: { type: "string" },
      reply: { type: "string" },
      preview: { type: "string" },
      detectedLanguage: { type: "string" },
      note: { type: "string" }
    },
    required: ["commentPreview", "reply", "preview", "detectedLanguage", "note"]
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

  if (provider === "groq") {
    return settings.groqApiKey;
  }

  if (provider === "openrouter") {
    return settings.openrouterApiKey;
  }

  return settings.openaiApiKey || settings.apiKey;
}

function providerLabel(provider) {
  return (
    {
      openai: "OpenAI",
      gemini: "Gemini",
      anthropic: "Anthropic",
      groq: "Groq",
      openrouter: "OpenRouter"
    }[provider] || provider
  );
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
