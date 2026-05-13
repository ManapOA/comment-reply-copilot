# Mozilla Add-ons Listing

## Summary

AI reply drafts for YouTube Studio comments with configurable language previews.

## Description

TubeReply helps YouTube creators draft AI replies to YouTube Studio comments faster.

It adds an AI button near comment reply controls, reads the selected visible comment, and creates a draft reply using your own API key. Replies can use the commenter's language or a language you choose. TubeReply also shows a preview/translation before insertion, so you can understand the reply before using it.

You can draft replies for individual comments or selected comments in bulk. The extension supports OpenAI, Gemini, Anthropic Claude, Groq, and OpenRouter. API keys and settings are stored locally in browser extension storage.

TubeReply never publishes comments automatically. You always review, insert, and publish replies yourself.

RU:
TubeReply помогает авторам быстрее готовить AI-ответы на комментарии в YouTube Studio.

Расширение добавляет кнопку AI рядом с ответом на комментарий, читает выбранный видимый комментарий и создает черновик ответа через ваш собственный API-ключ. Можно отвечать на языке комментария или выбрать конкретный язык ответа. Перед вставкой показывается превью/перевод.

Поддерживаются отдельные комментарии и bulk-режим для выбранных комментариев. Интерфейс настроек доступен на русском и английском. Ключи API и настройки хранятся локально в хранилище расширения браузера.

Расширение не публикует комментарии автоматически. Вы сами проверяете, вставляете и публикуете ответ.

## Category

Productivity

## Permission Justifications

### storage

Stores the selected AI provider, API key, model name, interface language, reply language, preview language, tone settings, and panel position locally in browser extension storage.

### Host permission: studio.youtube.com

Required to read visible YouTube Studio comments and insert generated reply drafts into YouTube Studio reply fields.

### Host permissions: AI provider APIs

Required to send the selected comment to the AI provider chosen by the user and receive a reply draft. The extension uses the user's own API key.

Covered hosts:

- api.openai.com
- generativelanguage.googleapis.com
- api.anthropic.com
- api.groq.com
- openrouter.ai

## Data Collection Declaration

The extension transmits website content and authentication information only when the user requests a draft reply.

- `websiteContent`: the selected visible YouTube Studio comment text.
- `authenticationInfo`: the user's API key for the selected AI provider.

The extension developer does not operate a backend server, does not receive this data, and does not sell or share user data.

## Review Notes

The extension has a single purpose: help YouTube Studio users draft replies to comments.

It uses user-provided API keys for OpenAI, Gemini, Anthropic Claude, Groq, or OpenRouter. It does not include API keys, does not use a developer-operated backend, and does not execute remote code.

The extension inserts generated reply text as a draft only. It does not click the final YouTube submit/reply button.

## Test Instructions

1. Install the extension.
2. Open the extension popup/options page.
3. Select an AI provider and enter a valid API key for that provider.
4. Open YouTube Studio -> Community -> Comments.
5. Click `AI` near a comment or click `Reply`.
6. Confirm that a suggested reply and configured preview appear.
7. Click `Insert` and confirm that the draft is inserted into the reply field but not published.
8. Select one or more comments with checkboxes and click `AI selected`.
9. Confirm that one draft reply is generated per selected comment.
