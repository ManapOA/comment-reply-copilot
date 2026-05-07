const DEFAULTS = {
  provider: "openai",
  model: "gpt-5.4-mini",
  openaiModel: "gpt-5.4-mini",
  geminiModel: "gemini-2.5-flash",
  anthropicModel: "claude-sonnet-4-20250514",
  brandVoice:
    "Warm, grateful, short, human. Avoid sounding like spam. Never make promises or medical/legal/financial claims.",
  maxWords: 35,
  replyLanguage: "auto"
};

const form = document.querySelector("#settings");
const status = document.querySelector("#status");
const provider = document.querySelector("#provider");

restore();

provider.addEventListener("change", syncProviderCards);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await chrome.storage.local.set({
    provider: provider.value,
    apiKey: document.querySelector("#openaiApiKey").value.trim(),
    openaiApiKey: document.querySelector("#openaiApiKey").value.trim(),
    geminiApiKey: document.querySelector("#geminiApiKey").value.trim(),
    anthropicApiKey: document.querySelector("#anthropicApiKey").value.trim(),
    model: document.querySelector("#openaiModel").value.trim() || DEFAULTS.openaiModel,
    openaiModel: document.querySelector("#openaiModel").value.trim() || DEFAULTS.openaiModel,
    geminiModel: document.querySelector("#geminiModel").value.trim() || DEFAULTS.geminiModel,
    anthropicModel:
      document.querySelector("#anthropicModel").value.trim() || DEFAULTS.anthropicModel,
    brandVoice: document.querySelector("#brandVoice").value.trim() || DEFAULTS.brandVoice,
    maxWords: Number(document.querySelector("#maxWords").value) || DEFAULTS.maxWords,
    replyLanguage: document.querySelector("#replyLanguage").value || DEFAULTS.replyLanguage
  });

  status.textContent = "Saved";
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
      "replyLanguage"
    ]))
  };

  provider.value = values.provider;
  document.querySelector("#openaiApiKey").value = values.openaiApiKey || values.apiKey || "";
  document.querySelector("#geminiApiKey").value = values.geminiApiKey || "";
  document.querySelector("#anthropicApiKey").value = values.anthropicApiKey || "";
  document.querySelector("#openaiModel").value = values.openaiModel || values.model;
  document.querySelector("#geminiModel").value = values.geminiModel;
  document.querySelector("#anthropicModel").value = values.anthropicModel;
  document.querySelector("#brandVoice").value = values.brandVoice;
  document.querySelector("#maxWords").value = values.maxWords;
  document.querySelector("#replyLanguage").value = values.replyLanguage;

  syncProviderCards();
}

function syncProviderCards() {
  document.querySelectorAll("[data-provider-card]").forEach((card) => {
    card.hidden = card.dataset.providerCard !== provider.value;
  });
}
