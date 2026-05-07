# Chrome Web Store Listing

## Name

TubeReply

## Short description

AI reply drafts for YouTube Studio comments with configurable language previews.

## Detailed description

TubeReply helps creators draft replies to high-volume YouTube Studio comments.

The extension adds an AI button near YouTube Studio comment reply controls. When you click it, the extension reads the selected comment, sends it to your chosen AI provider using your own API key, and shows a suggested reply plus a configurable language preview so you can understand the response before using it.

Features:

- Draft replies for individual YouTube Studio comments.
- Draft replies for selected comments in bulk.
- Preview the suggested reply in your selected preview language.
- Switch the settings interface between Russian and English.
- Choose common models from a list, with a custom model option for new provider releases.
- Supports OpenAI, Gemini, and Anthropic Claude API keys.
- Stores provider settings locally in Chrome.
- Does not publish comments automatically.

The extension is built for creators and community managers who review many YouTube comments and want faster draft suggestions while keeping manual control.

## Category

Productivity

## Language

English

## Single purpose

The extension helps YouTube Studio users draft and insert AI-generated replies to comments, with a configurable language preview before use.

## Permission justifications

### storage

Stores the user's selected AI provider, API key, model name, interface language, reply language, preview language, and tone settings locally in Chrome.

### Host permission: studio.youtube.com

Required to read visible YouTube Studio comments and insert draft replies into YouTube Studio reply fields.

### Host permissions: api.openai.com, generativelanguage.googleapis.com, api.anthropic.com

Required to send the selected comment to the AI provider chosen by the user and receive a reply draft. The extension uses the user's own API key.

## Remote code declaration

No remote code is loaded or executed. The extension sends HTTPS API requests to AI providers selected by the user, but all extension code is packaged inside the extension.

## Data usage disclosure draft

This extension processes:

- Website content: YouTube Studio comment text visible to the user.
- Authentication information: API keys entered by the user for OpenAI, Gemini, or Anthropic.
- User activity: selected comments and reply actions inside YouTube Studio.

Data is used only to generate reply drafts requested by the user. API keys and settings are stored locally in Chrome storage. Comment text is sent only to the AI provider selected by the user. The extension developer does not operate a backend server and does not sell or share user data.

## Test instructions

1. Install the extension.
2. Open the extension popup/options page.
3. Select an AI provider and enter a valid API key for that provider.
4. Open YouTube Studio -> Community -> Comments.
5. Click `AI` near a comment or click `Reply`.
6. Confirm that a suggested reply and configured preview appear.
7. Click `Insert` and confirm that the draft is inserted into the reply field but not published.
8. Select one or more comments with checkboxes and click `AI selected`.
9. Confirm that one draft reply is generated and inserted per selected comment.
