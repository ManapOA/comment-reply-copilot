# Comment Reply Copilot

Chrome extension for YouTube Studio comments. It adds an `AI` button near `Ответить` and also reacts when you click `Ответить`. The extension suggests a short reply in the commenter's language and shows a Russian translation so you understand what will be posted.

Supported providers:

- OpenAI
- Gemini
- Anthropic Claude

## Setup

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `c:\Users\admn\Documents\git\extension`.
5. Open the extension settings, choose a provider, and add that provider's API key.
6. Open YouTube Studio comments and use `Ответить` or `AI`.
7. To draft several replies at once, select comment checkboxes and click `AI selected`.

## Notes

- The API key is stored locally in Chrome storage.
- The extension does not auto-publish comments. It only inserts or copies the suggested text.
- Bulk mode generates one suggested reply per selected comment and inserts each reply as a draft. It still does not publish anything.
- YouTube Studio changes its internal HTML often, so if a future layout breaks insertion, the copy button should still work.
