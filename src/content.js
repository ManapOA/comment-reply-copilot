const ROOT_CLASS = "ccr-root";
const AI_BUTTON_CLASS = "ccr-ai-button";
const BULK_BUTTON_CLASS = "ccr-bulk-button";
const PANEL_CLASS = "ccr-panel";
const AI_READY_ATTR = "data-ccr-ai-ready";
const BUTTON_TEXT = "AI";
const BULK_BATCH_LIMIT = 10;
const BULK_GENERATE_PAUSE_MS = 250;
const DOM_MAINTENANCE_DELAY_MS = 600;

const processed = new WeakSet();
const bulkProcessed = new WeakSet();
const suppressedReplyClicks = new WeakSet();
let activePanel = null;
let bulkButton = null;
let maintenanceTimer = 0;
let bulkInProgress = false;

bootstrap();

function bootstrap() {
  cleanupDuplicateAiButtons();
  injectButtons();
  syncBulkButton();
  document.addEventListener("click", handleReplyClick, true);
  document.addEventListener("pointerdown", handleOutsidePointerDown, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("change", () => scheduleDomMaintenance(), true);

  const observer = new MutationObserver(scheduleDomMaintenance);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scheduleDomMaintenance() {
  if (maintenanceTimer) {
    return;
  }

  maintenanceTimer = window.setTimeout(() => {
    maintenanceTimer = 0;
    window.requestAnimationFrame(() => {
      if (bulkInProgress) {
        return;
      }

      injectButtons();
      syncBulkButton();
    });
  }, DOM_MAINTENANCE_DELAY_MS);
}

function injectButtons() {
  cleanupDuplicateAiButtons();

  for (const button of findReplyButtons()) {
    if (processed.has(button)) {
      continue;
    }

    const commentNode = findCommentContainer(button);
    const existingInRow = findAiButtonsNear(button);
    const commentHasAi = Boolean(commentNode?.querySelector(`.${AI_BUTTON_CLASS}`));
    if (existingInRow.length || (commentNode?.getAttribute(AI_READY_ATTR) === "true" && commentHasAi)) {
      commentNode?.setAttribute(AI_READY_ATTR, "true");
      processed.add(button);
      continue;
    }

    processed.add(button);
    commentNode?.setAttribute(AI_READY_ATTR, "true");
    const aiButton = document.createElement("button");
    aiButton.type = "button";
    aiButton.className = AI_BUTTON_CLASS;
    aiButton.textContent = BUTTON_TEXT;
    aiButton.title = "Suggest a bilingual reply";
    aiButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suggestForReplyButton(button, aiButton);
    });

    button.insertAdjacentElement("afterend", aiButton);
  }

  cleanupDuplicateAiButtons();
}

function findReplyButtons() {
  const candidates = [
    ...document.querySelectorAll("ytcp-button, tp-yt-paper-button, button, [role='button']")
  ];

  const byComment = new Map();
  const buttons = candidates
    .filter((element) => !element.classList.contains(AI_BUTTON_CLASS))
    .map((element) => canonicalReplyButton(element))
    .filter(Boolean)
    .filter((element) => {
      const text = visibleText(element).toLowerCase();
      return text === "ответить" || text === "reply" || text === "responder";
    });

  for (const button of buttons) {
    const commentNode = findCommentContainer(button);
    if (!commentNode) {
      continue;
    }

    if (!byComment.has(commentNode)) {
      byComment.set(commentNode, button);
    }
  }

  return [...byComment.values()];
}

function handleReplyClick(event) {
  const button = canonicalReplyButton(
    event.target.closest("ytcp-button, tp-yt-paper-button, button, [role='button']")
  );
  if (!button || button.classList.contains(AI_BUTTON_CLASS)) {
    return;
  }

  if (suppressedReplyClicks.has(button)) {
    suppressedReplyClicks.delete(button);
    return;
  }

  const text = visibleText(button).toLowerCase();
  if (text !== "ответить" && text !== "reply" && text !== "responder") {
    return;
  }

  window.setTimeout(() => suggestForReplyButton(button, button), 250);
}

function handleOutsidePointerDown(event) {
  if (!activePanel) {
    return;
  }

  const target = event.target;
  if (
    activePanel.contains(target) ||
    target.closest?.(`.${AI_BUTTON_CLASS}`) ||
    target.closest?.(`.${BULK_BUTTON_CLASS}`)
  ) {
    return;
  }

  closePanel();
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    closePanel();
  }
}

async function suggestForReplyButton(replyButton, anchor) {
  const commentNode = findCommentContainer(replyButton);
  const payload = extractCommentPayload(commentNode);

  if (!payload.comment) {
    showPanel(anchor, {
      loading: false,
      error: "Не удалось прочитать текст комментария. Попробуй кнопку AI рядом с нужным комментарием."
    });
    return;
  }

  showPanel(anchor, { loading: true });

  chrome.runtime.sendMessage(
    {
      type: "CCR_GENERATE_REPLY",
      payload
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showPanel(anchor, { error: chrome.runtime.lastError.message });
        return;
      }

      if (!response?.ok) {
        showPanel(anchor, { error: response?.error || "Не удалось получить ответ." });
        return;
      }

      showPanel(anchor, { result: response.result, commentNode, payload });
    }
  );
}

function findCommentContainer(start) {
  let best = null;
  let bestScore = 0;
  let node = start;

  for (let i = 0; node && i < 14; i += 1) {
    if (node.nodeType !== Node.ELEMENT_NODE || node === document.body || node === document.documentElement) {
      break;
    }

    const text = rawText(node);
    const score = scoreCommentContainer(node, text);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }

    node = node.parentElement;
  }

  return best || start.closest("div") || start.parentElement;
}

function extractCommentPayload(commentNode) {
  const text = removeExtensionText(rawText(commentNode));
  const lines = normalizeCommentLines(text);
  const visualComment = extractVisualComment(commentNode);

  const authorLine = lines.find((line) => line.startsWith("@")) || "";
  const author = authorLine.match(/^@\S+/)?.[0] || "";
  const denseComment = authorLine ? extractCommentFromAuthorLine(authorLine) : "";
  const comment = visualComment || denseComment || pickCommentLine(lines, author);
  const commentStyle = detectCommentStyle(comment);

  return {
    author,
    comment,
    commentStyle,
    context: buildSafeContext(lines, comment),
    pageTitle: document.title
  };
}

function normalizeCommentLines(text) {
  return text
    .split("\n")
    .flatMap((line) => splitDenseLine(line))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isUiLine(line));
}

function extractVisualComment(commentNode) {
  const replyButton = findReplyButtonInside(commentNode);
  const authorElement = findAuthorElement(commentNode);
  const directEmoji = findDirectEmojiComment(commentNode, authorElement, replyButton);
  if (directEmoji) {
    return directEmoji;
  }

  const candidates = [];

  for (const element of commentNode.querySelectorAll("*")) {
    if (!isVisible(element) || isInsideIgnoredArea(element) || element === replyButton || element.contains(replyButton)) {
      continue;
    }

    const text = visibleText(element);
    if (!isLikelyCommentText(text)) {
      continue;
    }

    if (authorElement && isElementBefore(element, authorElement)) {
      continue;
    }

    if (replyButton && isElementAfter(element, replyButton)) {
      continue;
    }

    if (looksLikeVideoTitle(text)) {
      continue;
    }

    const style = detectCommentStyle(text);
    let score = text.length;
    if (style === "emoji_only") {
      score += 500;
    }
    if (style === "mostly_emoji") {
      score += 250;
    }

    candidates.push({ text, score });
  }

  return candidates.sort((a, b) => b.score - a.score)[0]?.text || "";
}

function findAuthorElement(root) {
  return [...root.querySelectorAll("*")].find((element) => visibleText(element).startsWith("@")) || null;
}

function findDirectEmojiComment(root, authorElement, replyButton) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const candidates = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const text = node.textContent.trim();

    if (!parent || !text || !isLikelyCommentText(text) || detectCommentStyle(text) !== "emoji_only") {
      continue;
    }

    if (isInsideIgnoredArea(parent)) {
      continue;
    }

    if (authorElement && isElementBefore(parent, authorElement)) {
      continue;
    }

    if (replyButton && isElementAfter(parent, replyButton)) {
      continue;
    }

    candidates.push(text);
  }

  return candidates[0] || "";
}

function isElementBefore(element, reference) {
  return Boolean(element.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function isElementAfter(element, reference) {
  return Boolean(element.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_PRECEDING);
}

function looksLikeVideoTitle(text) {
  return text.length > 18 && !/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(text);
}

function isLikelyCommentText(text) {
  const normalized = String(text || "").trim();
  if (!normalized || normalized.length > 500) {
    return false;
  }

  if (
    normalized.startsWith("@") ||
    isUiLine(normalized) ||
    looksLikeMetaLine(normalized) ||
    isEditorText(normalized) ||
    normalized === "Ещё" ||
    normalized === "Еще" ||
    normalized.toLowerCase() === "more"
  ) {
    return false;
  }

  return true;
}

function isEditorText(text) {
  const normalized = text.toLowerCase();
  return (
    normalized === "ответ" ||
    normalized === "введите ответ" ||
    normalized === "отмена" ||
    normalized === "reply" ||
    normalized === "add a reply"
  );
}

function isInsideIgnoredArea(element) {
  return Boolean(
    element.closest?.(
      `.${ROOT_CLASS}, textarea, input, [contenteditable='true'], #textarea, ytcp-commentbox, ytcp-commentbox-lit`
    )
  );
}

function buildSafeContext(lines, comment) {
  return lines
    .filter((line) => line === comment || line.startsWith("@"))
    .slice(0, 4)
    .join("\n");
}

function pickCommentLine(lines, author) {
  const ignored = new Set([author]);
  return (
    lines.find((line) => {
      if (ignored.has(line) || line.startsWith("@") || looksLikeMetaLine(line)) {
        return false;
      }

      if (isUiLine(line)) {
        return false;
      }

      return line.length > 2;
    }) || ""
  );
}

function extractCommentFromAuthorLine(line) {
  const withoutAuthor = line.replace(/^@\S+/, "").trim();
  const withoutTime = withoutAuthor
    .replace(/^[-•.\s]+/, "")
    .replace(/^\d+\s+\S+\s+\S+\s*/i, "")
    .trim();

  if (!withoutTime || looksLikeMetaLine(withoutTime) || isUiLine(withoutTime)) {
    return "";
  }

  return withoutTime;
}

function isUiLine(line) {
  const normalized = line.toLowerCase();
  return [
    "ответить",
    "reply",
    "responder",
    "нет ответов",
    "no replies",
    "без ответа",
    "like",
    "dislike"
  ].some((item) => normalized === item || normalized.includes(` ${item} `));
}

function canonicalReplyButton(element) {
  if (!element || element.classList?.contains(AI_BUTTON_CLASS)) {
    return null;
  }

  const outer = element.closest?.("ytcp-button, tp-yt-paper-button, button");
  return outer || element;
}

function cleanupDuplicateAiButtons() {
  cleanupDetachedAiButtons();

  for (const button of findRawReplyButtons()) {
    const nearby = findAiButtonsNear(button);
    nearby.slice(1).forEach((aiButton) => aiButton.remove());
  }

  const byComment = new Map();
  for (const aiButton of document.querySelectorAll(`.${AI_BUTTON_CLASS}`)) {
    const commentNode = findCommentContainer(aiButton);
    if (!commentNode) {
      continue;
    }

    if (!byComment.has(commentNode)) {
      byComment.set(commentNode, aiButton);
      commentNode.setAttribute(AI_READY_ATTR, "true");
      continue;
    }

    aiButton.remove();
  }
}

function cleanupDetachedAiButtons() {
  for (const aiButton of document.querySelectorAll(`.${AI_BUTTON_CLASS}`)) {
    const parentText = visibleText(aiButton.parentElement || document.body).toLowerCase();
    if (!parentText.includes("ответить") && !parentText.includes("reply") && !parentText.includes("responder")) {
      aiButton.remove();
    }
  }
}

function findAiButtonsNear(replyButton) {
  const parent = replyButton?.parentElement;
  if (!parent) {
    return [];
  }

  return [...parent.querySelectorAll(`.${AI_BUTTON_CLASS}`)];
}

function findRawReplyButtons() {
  return [
    ...new Set(
      [
        ...document.querySelectorAll("ytcp-button, tp-yt-paper-button, button, [role='button']")
      ]
        .filter((element) => !element.classList.contains(AI_BUTTON_CLASS))
        .map((element) => canonicalReplyButton(element))
        .filter(Boolean)
        .filter((element) => {
          const text = visibleText(element).toLowerCase();
          return text === "ответить" || text === "reply" || text === "responder";
        })
    )
  ];
}

function scoreCommentContainer(element, text) {
  if (!text || text.length < 8) {
    return 0;
  }

  let score = 0;
  const lowerText = text.toLowerCase();
  const marker = `${element.id || ""} ${element.className || ""}`.toLowerCase();

  if (/@[\w.-]{2,}/.test(text)) {
    score += 50;
  }

  if (lowerText.includes("ответить") || lowerText.includes("reply") || lowerText.includes("responder")) {
    score += 20;
  }

  if (marker.includes("comment")) {
    score += 25;
  }

  if (safeMatches(element, "ytcp-comment-thread, ytcp-comment, tr")) {
    score += 35;
  }

  if (text.length > 20 && text.length < 2500) {
    score += 15;
  }

  if (element.querySelector("textarea, input[type='text'], [contenteditable='true'], #textarea")) {
    score -= 8;
  }

  return score;
}

function splitDenseLine(line) {
  return line
    .replace(/\s+(Ответить|Reply|Responder)\s+/gi, "\n$1\n")
    .replace(/\s+(Нет ответов|No replies)\s+/gi, "\n$1\n")
    .split("\n");
}

function removeExtensionText(text) {
  return text.replace(/\bAI\b/g, "\n");
}

function looksLikeMetaLine(line) {
  const normalized = line.toLowerCase();
  return (
    /^[\d\s.,]+$/.test(normalized) ||
    normalized.includes("минут") ||
    normalized.includes("час") ||
    normalized.includes("дн") ||
    normalized.includes("second") ||
    normalized.includes("minute") ||
    normalized.includes("hour") ||
    normalized.includes("day") ||
    normalized.includes("sem resposta") ||
    normalized.includes("sin respuestas")
  );
}

function detectCommentStyle(comment) {
  if (!comment) {
    return "empty";
  }

  const withoutEmoji = comment
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s/g, "");

  if (!withoutEmoji) {
    return "emoji_only";
  }

  if (comment.length <= 12 && /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(comment)) {
    return "mostly_emoji";
  }

  return "text";
}

function showPanel(anchor, state) {
  closePanel();

  const panel = document.createElement("section");
  panel.className = `${PANEL_CLASS} ${ROOT_CLASS}`;
  panel.setAttribute("role", "dialog");

  if (state.loading) {
    panel.innerHTML = `<div class="ccr-status">Готовлю ответ...</div>`;
  } else if (state.customHtml) {
    panel.innerHTML = state.customHtml;
  } else if (state.error) {
    const errorView = getErrorView(state.error);
    panel.innerHTML = `
      <div class="ccr-top">
        <strong>${escapeHtml(errorView.title)}</strong>
        <button type="button" class="ccr-icon" data-action="close">x</button>
      </div>
      <div class="ccr-error">${escapeHtml(errorView.message)}</div>
      <button type="button" class="ccr-secondary" data-action="settings">${escapeHtml(errorView.button)}</button>
    `;
  } else {
    panel.innerHTML = renderResult(state.result, state.payload);
  }

  document.body.append(panel);
  positionPanel(panel, anchor);
  activePanel = panel;

  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) {
      return;
    }

    if (action === "close") {
      closePanel();
    }

    if (action === "copy") {
      navigator.clipboard?.writeText(state.result.reply);
      flash(event.target, "Скопировано");
    }

    if (action === "insert") {
      insertReply(state.result.reply, state.commentNode);
      flash(event.target, "Вставлено");
      window.setTimeout(closePanel, 250);
    }

    if (action === "settings") {
      chrome.runtime.openOptionsPage();
    }

    if (action === "bulk-copy") {
      const index = Number(event.target.closest("[data-index]")?.dataset.index);
      const item = state.items?.[index];
      if (item?.result?.reply) {
        navigator.clipboard?.writeText(item.result.reply);
        flash(event.target, "Скопировано");
      }
    }

    if (action === "bulk-insert") {
      const index = Number(event.target.closest("[data-index]")?.dataset.index);
      const item = state.items?.[index];
      if (item?.result?.reply) {
        openReplyAndInsert(item);
        flash(event.target, "Вставлено");
      }
    }
  });
}

function getErrorView(error) {
  const message = String(error || "Не удалось получить ответ.");
  const lower = message.toLowerCase();

  if (
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("try again later") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return {
      title: "Модель временно недоступна",
      message: `${message}\n\nПопробуй еще раз позже или выбери другую модель/провайдера в настройках.`,
      button: "Сменить модель"
    };
  }

  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("401")
  ) {
    return {
      title: "Нужна настройка",
      message,
      button: "Открыть настройки"
    };
  }

  return {
    title: "Ошибка генерации",
    message,
    button: "Открыть настройки"
  };
}

function renderResult(result, payload = {}) {
  const commentPreview = result.commentPreview || result.commentTranslation || result.translatedComment || payload.comment || "";
  const replyPreview = result.preview || result.russian || "";

  return `
    <div class="ccr-top">
      <div>
        <strong>Предложение ответа</strong>
        <span>${escapeHtml(result.detectedLanguage || "язык не определен")}</span>
      </div>
      <button type="button" class="ccr-icon" data-action="close">x</button>
    </div>
    <label class="ccr-label">Комментарий</label>
    <div class="ccr-box ccr-muted">${escapeHtml(commentPreview)}</div>
    <label class="ccr-label">Предложенный ответ</label>
    <div class="ccr-box">${escapeHtml(result.reply || "")}</div>
    <label class="ccr-label">Перевод ответа</label>
    <div class="ccr-box ccr-muted">${escapeHtml(replyPreview)}</div>
    ${result.note ? `<div class="ccr-note">${escapeHtml(result.note)}</div>` : ""}
    <div class="ccr-actions">
      <button type="button" class="ccr-primary" data-action="insert">Вставить</button>
      <button type="button" class="ccr-secondary" data-action="copy">Копировать</button>
    </div>
  `;
}

function syncBulkButton() {
  const selected = getSelectedComments();

  if (!selected.length) {
    bulkButton?.remove();
    bulkButton = null;
    return;
  }

  if (!bulkButton) {
    bulkButton = document.createElement("button");
    bulkButton.type = "button";
    bulkButton.className = BULK_BUTTON_CLASS;
    bulkButton.addEventListener("click", generateBulkReplies);
    document.body.append(bulkButton);
  }

  bulkButton.textContent = `AI selected (${selected.length})`;
}

async function generateBulkReplies() {
  if (bulkInProgress) {
    return;
  }

  const allSelected = getSelectedComments();
  if (!allSelected.length) {
    return;
  }

  bulkInProgress = true;
  bulkButton.disabled = true;

  try {
    const pendingSelected = allSelected.filter((item) => !bulkProcessed.has(item.commentNode));
    const sourceItems = pendingSelected.length ? pendingSelected : allSelected;
    const selected = sourceItems.slice(0, BULK_BATCH_LIMIT);
    const skippedCount = Math.max(0, sourceItems.length - selected.length);
    showBulkStatus("Готовлю ответы...", 0, selected.length, skippedCount);

    const items = [];
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      updateBulkStatus("Готовлю", index + 1, selected.length, skippedCount);

      try {
        const result = await sendGenerateMessage(item.payload);
        items.push({ ...item, result });
      } catch (error) {
        items.push({ ...item, error: error.message || String(error) });
      }

      await pauseBulkWork(BULK_GENERATE_PAUSE_MS);
    }

    items.forEach((item) => bulkProcessed.add(item.commentNode));
    showBulkResults(items, skippedCount);
  } finally {
    bulkInProgress = false;
    if (bulkButton) {
      bulkButton.disabled = false;
    }
    scheduleDomMaintenance();
  }
}

function showBulkStatus(title, current, total, skippedCount = 0) {
  showPanel(bulkButton, {
    loading: false,
    customHtml: renderBulkStatus(title, current, total, skippedCount)
  });
}

function updateBulkStatus(title, current, total, skippedCount = 0) {
  const status = activePanel?.querySelector("[data-bulk-status]");
  if (!status) {
    showBulkStatus(title, current, total, skippedCount);
    return;
  }

  status.innerHTML = renderBulkStatusContent(title, current, total, skippedCount);
}

function renderBulkStatus(title, current, total, skippedCount = 0) {
  return `<div class="ccr-status" data-bulk-status>${renderBulkStatusContent(title, current, total, skippedCount)}</div>`;
}

function renderBulkStatusContent(title, current, total, skippedCount = 0) {
  const percent = total ? Math.round((Math.min(current, total) / total) * 100) : 0;
  return `
    <strong>${escapeHtml(title)} ${Math.min(current, total)} из ${total}</strong>
    <div class="ccr-progress" aria-hidden="true"><span style="width: ${percent}%"></span></div>
    ${
      skippedCount
        ? `<div class="ccr-note">Чтобы не перегружать вкладку, за один запуск обработано ${total}. Осталось ${skippedCount}: запусти AI selected еще раз.</div>`
        : ""
    }
  `;
}

function showBulkResults(items, skippedCount = 0) {
  closePanel();

  const panel = document.createElement("section");
  panel.className = `${PANEL_CLASS} ${ROOT_CLASS} ccr-bulk-panel`;
  panel.setAttribute("role", "dialog");
  panel.innerHTML = `
    <div class="ccr-top">
      <div>
        <strong>Ответы для выбранных</strong>
        <span>${items.length} комментариев${skippedCount ? `, пропущено ${skippedCount}` : ""}</span>
      </div>
      <button type="button" class="ccr-icon" data-action="close">x</button>
    </div>
    <div class="ccr-note">Автовставка в bulk отключена, чтобы YouTube Studio не подвисал. Вставляй нужные ответы кнопкой в карточке.</div>
    ${
      skippedCount
        ? `<div class="ccr-note">Пачка ограничена ${BULK_BATCH_LIMIT} комментариями, чтобы YouTube Studio не подвисал. Следующий запуск продолжит с еще не обработанных выбранных комментариев.</div>`
        : ""
    }
    <div class="ccr-bulk-list">
      ${items.map(renderBulkItem).join("")}
    </div>
  `;

  document.body.append(panel);
  positionPanel(panel, bulkButton, { mode: "center" });
  activePanel = panel;

  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) {
      return;
    }

    if (action === "close") {
      closePanel();
      return;
    }

    const index = Number(event.target.closest("[data-index]")?.dataset.index);
    const item = items[index];
    if (!item?.result?.reply) {
      return;
    }

    if (action === "bulk-copy") {
      navigator.clipboard?.writeText(item.result.reply);
      flash(event.target, "Скопировано");
    }

    if (action === "bulk-insert") {
      openReplyAndInsert(item);
      flash(event.target, "Вставлено");
    }
  });
}

function renderBulkItem(item, index) {
  const title = item.payload.author || `Комментарий ${index + 1}`;
  const commentPreview =
    item.result?.commentPreview ||
    item.result?.commentTranslation ||
    item.result?.translatedComment ||
    item.payload.comment ||
    "";
  const replyPreview = item.result?.preview || item.result?.russian || "";

  if (item.error) {
    return `
      <article class="ccr-bulk-item" data-index="${index}">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(item.payload.comment)}</p>
        <div class="ccr-error">${escapeHtml(item.error)}</div>
      </article>
    `;
  }

  return `
    <article class="ccr-bulk-item" data-index="${index}">
      <strong>${escapeHtml(title)}</strong>
      <label class="ccr-label">Комментарий</label>
      <div class="ccr-box ccr-muted">${escapeHtml(commentPreview)}</div>
      <label class="ccr-label">Предложенный ответ</label>
      <div class="ccr-box">${escapeHtml(item.result.reply)}</div>
      <label class="ccr-label">Перевод ответа</label>
      <div class="ccr-box ccr-muted">${escapeHtml(replyPreview)}</div>
      ${item.inserted ? `<div class="ccr-note">Вставлено в поле ответа.</div>` : ""}
      <div class="ccr-actions">
        <button type="button" class="ccr-primary" data-action="bulk-insert">Вставить</button>
        <button type="button" class="ccr-secondary" data-action="bulk-copy">Копировать</button>
      </div>
    </article>
  `;
}

function positionPanel(panel, anchor, options = {}) {
  const margin = 12;
  const width = options.mode === "center" ? Math.min(620, window.innerWidth - margin * 2) : Math.min(380, window.innerWidth - margin * 2);

  panel.style.width = `${width}px`;

  if (options.mode === "center") {
    panel.style.position = "fixed";
    panel.style.left = `${Math.max(margin, (window.innerWidth - width) / 2)}px`;
    panel.style.top = `${Math.max(margin, Math.min(80, window.innerHeight * 0.12))}px`;
    panel.style.maxHeight = `${window.innerHeight - margin * 2}px`;
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const measuredHeight = Math.min(panel.offsetHeight || 260, window.innerHeight - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  const belowTop = rect.bottom + 8;
  const aboveTop = rect.top - measuredHeight - 8;
  const top = belowTop + measuredHeight <= window.innerHeight - margin ? belowTop : Math.max(margin, aboveTop);

  panel.style.position = "fixed";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `${window.innerHeight - margin * 2}px`;
}

function insertReply(reply, commentNode) {
  const editor = findEditor(commentNode);
  if (!editor) {
    navigator.clipboard?.writeText(reply);
    return;
  }

  editor.focus();

  if (editor.matches("textarea, input")) {
    editor.value = reply;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, reply);
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: reply }));
}

function openReplyAndInsert(item) {
  if (item.replyButton) {
    suppressedReplyClicks.add(item.replyButton);
    item.replyButton.click();
  }
  window.setTimeout(() => insertReply(item.result.reply, item.commentNode), 300);
}

function findEditor(commentNode) {
  if (isEditable(document.activeElement)) {
    return document.activeElement;
  }

  const roots = [commentNode, document];
  for (const root of roots) {
    const editor = root.querySelector?.("textarea, input[type='text'], [contenteditable='true'], #textarea");
    if (editor && isVisible(editor)) {
      return editor;
    }
  }
  return null;
}

function closePanel() {
  activePanel?.remove();
  activePanel = null;
}

function getSelectedComments() {
  const controls = [
    ...document.querySelectorAll(
      "input[type='checkbox']:checked, [role='checkbox'][aria-checked='true'], tp-yt-paper-checkbox[checked], ytcp-checkbox-lit[checked]"
    )
  ];

  const items = [];
  const seen = new Set();

  for (const control of controls) {
    if (!isVisible(control) || activePanel?.contains(control) || bulkButton?.contains(control)) {
      continue;
    }

    const commentNode = findSelectedCommentContainer(control);
    if (!commentNode || seen.has(commentNode)) {
      continue;
    }

    const replyButton = findReplyButtonInside(commentNode);
    if (!replyButton) {
      continue;
    }

    const payload = extractCommentPayload(commentNode);
    if (!payload.comment || isSelectionToolbarPayload(payload)) {
      continue;
    }

    seen.add(commentNode);
    items.push({ commentNode, payload, replyButton });
  }

  return items;
}

function findSelectedCommentContainer(control) {
  let best = null;
  let bestScore = 0;
  let node = control;

  for (let i = 0; node && i < 12; i += 1) {
    if (node.nodeType !== Node.ELEMENT_NODE || node === document.body || node === document.documentElement) {
      break;
    }

    const replyButton = findReplyButtonInside(node);
    if (!replyButton) {
      node = node.parentElement;
      continue;
    }

    const text = removeExtensionText(rawText(node));
    const replyCount = countReplyButtonsInside(node);
    const checkedCount = node.querySelectorAll(
      "input[type='checkbox']:checked, [role='checkbox'][aria-checked='true'], tp-yt-paper-checkbox[checked], ytcp-checkbox-lit[checked]"
    ).length;

    let score = scoreCommentContainer(node, text);
    if (replyCount === 1) {
      score += 80;
    } else {
      score -= replyCount * 30;
    }

    if (checkedCount === 1) {
      score += 25;
    } else {
      score -= checkedCount * 12;
    }

    if (text.toLowerCase().includes("выбрано") || text.toLowerCase().includes("select all")) {
      score -= 100;
    }

    if (score > bestScore) {
      best = node;
      bestScore = score;
    }

    node = node.parentElement;
  }

  return best;
}

function findReplyButtonInside(root) {
  const candidates = [
    ...root.querySelectorAll("ytcp-button, tp-yt-paper-button, button, [role='button']")
  ];

  return (
    candidates
      .filter((element) => !element.classList.contains(AI_BUTTON_CLASS))
      .map((element) => canonicalReplyButton(element))
      .filter(Boolean)
      .find((button) => {
        const text = visibleText(button).toLowerCase();
        return text === "ответить" || text === "reply" || text === "responder";
      }) || null
  );
}

function countReplyButtonsInside(root) {
  return new Set(
    [...root.querySelectorAll("ytcp-button, tp-yt-paper-button, button, [role='button']")]
      .map((element) => canonicalReplyButton(element))
      .filter(Boolean)
      .filter((button) => {
        const text = visibleText(button).toLowerCase();
        return text === "ответить" || text === "reply" || text === "responder";
      })
  ).size;
}

function isSelectionToolbarPayload(payload) {
  const comment = payload.comment.toLowerCase();
  return (
    comment.includes("опубликованные") ||
    comment.includes("выбрано") ||
    comment.includes("select all") ||
    comment.includes("published")
  );
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pauseBulkWork(ms) {
  await delay(ms);
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function sendGenerateMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "CCR_GENERATE_REPLY", payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Не удалось получить ответ."));
        return;
      }

      resolve(response.result);
    });
  });
}

function visibleText(element) {
  return rawText(element).replace(/\s+/g, " ").trim();
}

function rawText(element) {
  return (element?.innerText || element?.textContent || "").trim();
}

function safeMatches(element, selector) {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isEditable(element) {
  return Boolean(
    element &&
      isVisible(element) &&
      (element.matches?.("textarea, input[type='text'], [contenteditable='true'], #textarea") ||
        element.isContentEditable)
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function flash(button, text) {
  const oldText = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = oldText;
  }, 1200);
}
