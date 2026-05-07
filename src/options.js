const DEFAULTS = {
  provider: "openai",
  model: "gpt-5.4-mini",
  openaiModel: "gpt-5.4-mini",
  geminiModel: "gemini-2.5-flash",
  anthropicModel: "claude-sonnet-4-20250514",
  brandVoice:
    "Warm, grateful, short, human. Avoid sounding like spam. Never make promises or medical/legal/financial claims.",
  maxWords: 35,
  replyLanguage: "auto",
  previewLanguage: "browser",
  uiLanguage: "ru"
};

const LANGUAGES = [
  "Afrikaans",
  "Albanian",
  "Amharic",
  "Arabic",
  "Armenian",
  "Azerbaijani",
  "Basque",
  "Belarusian",
  "Bengali",
  "Bosnian",
  "Bulgarian",
  "Burmese",
  "Catalan",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Filipino",
  "Finnish",
  "French",
  "Georgian",
  "German",
  "Greek",
  "Gujarati",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Kannada",
  "Kazakh",
  "Korean",
  "Kyrgyz",
  "Latvian",
  "Lithuanian",
  "Malay",
  "Malayalam",
  "Marathi",
  "Norwegian",
  "Persian",
  "Polish",
  "Portuguese",
  "Punjabi",
  "Romanian",
  "Russian",
  "Serbian",
  "Slovak",
  "Slovenian",
  "Spanish",
  "Swahili",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Uzbek",
  "Vietnamese"
];

const MODEL_OPTIONS = {
  openai: [
    ["gpt-5.4-mini", "GPT-5.4 mini - recommended"],
    ["gpt-5.4", "GPT-5.4 - smarter"],
    ["gpt-5.4-nano", "GPT-5.4 nano - fastest"],
    ["gpt-5-mini", "GPT-5 mini - fallback"],
    ["gpt-5-nano", "GPT-5 nano - cheap fallback"]
  ],
  gemini: [
    ["gemini-2.5-flash", "Gemini 2.5 Flash - recommended"],
    ["gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite - cheapest"],
    ["gemini-2.5-pro", "Gemini 2.5 Pro - smarter"],
    ["gemini-3-flash-preview", "Gemini 3 Flash Preview - experimental"]
  ],
  anthropic: [
    ["claude-sonnet-4-20250514", "Claude Sonnet 4 - recommended"],
    ["claude-opus-4-20250514", "Claude Opus 4 - smarter"],
    ["claude-3-7-sonnet-20250219", "Claude Sonnet 3.7 - fallback"],
    ["claude-3-5-haiku-20241022", "Claude Haiku 3.5 - fastest"]
  ]
};

const UI_TEXT = {
  ru: {
    privacyHint: "Ключи хранятся только в локальном хранилище Chrome на этом компьютере.",
    uiLanguage: "Язык интерфейса",
    provider: "Провайдер",
    replyLanguage: "Язык ответа",
    previewLanguage: "Язык превью",
    maxWords: "Максимум слов",
    brandVoice: "Тон канала",
    save: "Сохранить",
    saved: "Сохранено",
    sameAsComment: "Как у комментатора",
    browserLanguage: "Язык браузера",
    sameAsReply: "Как у ответа"
  },
  en: {
    privacyHint: "Keys are stored only in Chrome local storage on this computer.",
    uiLanguage: "Interface language",
    provider: "Provider",
    replyLanguage: "Reply language",
    previewLanguage: "Preview language",
    maxWords: "Max words",
    brandVoice: "Channel tone",
    save: "Save",
    saved: "Saved",
    sameAsComment: "Same as comment",
    browserLanguage: "Browser language",
    sameAsReply: "Same as reply"
  }
};

const form = document.querySelector("#settings");
const status = document.querySelector("#status");
const provider = document.querySelector("#provider");
const uiLanguage = document.querySelector("#uiLanguage");
const replyLanguage = document.querySelector("#replyLanguage");
const previewLanguage = document.querySelector("#previewLanguage");

populateModelSelects();
populateLanguageSelects();
restore();

uiLanguage.addEventListener("change", async () => {
  applyUiLanguage(uiLanguage.value);
  await chrome.storage.local.set({ uiLanguage: uiLanguage.value });
});
provider.addEventListener("change", syncProviderCards);
document.querySelectorAll("[data-model-select]").forEach((select) => {
  select.addEventListener("change", () => syncCustomModel(select.dataset.modelSelect));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const openaiModel = getSelectedModel("openai") || DEFAULTS.openaiModel;
  const geminiModel = getSelectedModel("gemini") || DEFAULTS.geminiModel;
  const anthropicModel = getSelectedModel("anthropic") || DEFAULTS.anthropicModel;

  await chrome.storage.local.set({
    provider: provider.value,
    apiKey: document.querySelector("#openaiApiKey").value.trim(),
    openaiApiKey: document.querySelector("#openaiApiKey").value.trim(),
    geminiApiKey: document.querySelector("#geminiApiKey").value.trim(),
    anthropicApiKey: document.querySelector("#anthropicApiKey").value.trim(),
    model: openaiModel,
    openaiModel,
    geminiModel,
    anthropicModel,
    brandVoice: document.querySelector("#brandVoice").value.trim() || DEFAULTS.brandVoice,
    maxWords: Number(document.querySelector("#maxWords").value) || DEFAULTS.maxWords,
    replyLanguage: replyLanguage.value || DEFAULTS.replyLanguage,
    previewLanguage: previewLanguage.value || DEFAULTS.previewLanguage,
    uiLanguage: uiLanguage.value || DEFAULTS.uiLanguage
  });

  status.textContent = t("saved");
  window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

async function restore() {
  const values = {
    ...DEFAULTS,
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
      "previewLanguage",
      "uiLanguage"
    ]))
  };

  provider.value = values.provider;
  uiLanguage.value = values.uiLanguage;
  applyUiLanguage(values.uiLanguage);
  document.querySelector("#openaiApiKey").value = values.openaiApiKey || values.apiKey || "";
  document.querySelector("#geminiApiKey").value = values.geminiApiKey || "";
  document.querySelector("#anthropicApiKey").value = values.anthropicApiKey || "";
  setModelControl("openai", values.openaiModel || values.model || DEFAULTS.openaiModel);
  setModelControl("gemini", values.geminiModel || DEFAULTS.geminiModel);
  setModelControl("anthropic", values.anthropicModel || DEFAULTS.anthropicModel);
  document.querySelector("#brandVoice").value = values.brandVoice;
  document.querySelector("#maxWords").value = values.maxWords;
  replyLanguage.value = values.replyLanguage;
  previewLanguage.value = values.previewLanguage;

  syncProviderCards();
}

function applyUiLanguage(language) {
  const messages = UI_TEXT[language] || UI_TEXT.ru;
  document.documentElement.lang = language;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (messages[key]) {
      element.innerHTML = messages[key];
    }
  });

  updateLanguageOptionLabels();
}

function t(key) {
  return (UI_TEXT[uiLanguage.value] || UI_TEXT.ru)[key] || UI_TEXT.ru[key] || key;
}

function populateModelSelects() {
  Object.entries(MODEL_OPTIONS).forEach(([providerName, options]) => {
    fillSelect(document.querySelector(`#${providerName}Model`), [
      ...options,
      ["custom", "Custom..."]
    ]);
  });
}

function populateLanguageSelects() {
  fillSelect(replyLanguage, [
    ["auto", t("sameAsComment")],
    ...LANGUAGES.map((language) => [language, language])
  ]);

  fillSelect(previewLanguage, [
    ["browser", t("browserLanguage")],
    ["reply", t("sameAsReply")],
    ...LANGUAGES.map((language) => [language, language])
  ]);
}

function updateLanguageOptionLabels() {
  setOptionLabel(replyLanguage, "auto", t("sameAsComment"));
  setOptionLabel(previewLanguage, "browser", t("browserLanguage"));
  setOptionLabel(previewLanguage, "reply", t("sameAsReply"));
}

function setOptionLabel(select, value, label) {
  const option = select.querySelector(`option[value="${value}"]`);
  if (option) {
    option.textContent = label;
  }
}

function fillSelect(select, options) {
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    })
  );
}

function getSelectedModel(providerName) {
  const select = document.querySelector(`#${providerName}Model`);
  if (select.value !== "custom") {
    return select.value;
  }

  return document.querySelector(`#${providerName}CustomModel`).value.trim();
}

function setModelControl(providerName, model) {
  const select = document.querySelector(`#${providerName}Model`);
  const customInput = document.querySelector(`#${providerName}CustomModel`);
  const knownModel = MODEL_OPTIONS[providerName].some(([value]) => value === model);

  if (knownModel) {
    select.value = model;
    customInput.value = "";
  } else {
    select.value = "custom";
    customInput.value = model;
  }

  syncCustomModel(providerName);
}

function syncCustomModel(providerName) {
  const select = document.querySelector(`#${providerName}Model`);
  const custom = document.querySelector(`[data-custom-model="${providerName}"]`);
  custom.hidden = select.value !== "custom";
}

function syncProviderCards() {
  document.querySelectorAll("[data-provider-card]").forEach((card) => {
    card.hidden = card.dataset.providerCard !== provider.value;
  });
}
