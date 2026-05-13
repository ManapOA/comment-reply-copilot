# Changelog

## 1.0.3 - 2026-05-13

- Fixed long YouTube comments being rejected by the text extractor before translation.
- Ignored placeholder/truncated fragments such as `...!` so they are not sent to the AI provider as the full comment.
- Improved structured comment reading by checking formatted text, visible text, and available accessibility/title text.

## 1.0.2 - 2026-05-13

- Added a Shuffle action to generate another natural reply variant without reopening the comment.
- Improved reply generation reliability with a timeout and safer empty-response/error handling.
- Made the reply panel positioning more robust if YouTube Studio changes or removes the expected anchor element.
- Tightened language instructions so auto language replies stay in the commenter's detected language instead of switching to the preview/interface language.

## 1.0.1

- Added privacy policy documentation and packaged the approved Chrome Web Store release.
