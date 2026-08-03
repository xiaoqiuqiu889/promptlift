# Prompt Lift

Prompt Lift is a small Windows expression assistant that works with ordinary editable input boxes. It keeps the original text in memory, sends it to the configured language model for a bounded rewrite, and lets the user apply, review, copy, cancel, or restore the result.

## Run from the Windows exe

Run `release/Prompt Lift-win32-x64/Prompt Lift.exe` by double-clicking it. The packaged app includes its runtime files, so the target computer does not need Node.js, npm, or a command window. The window opens directly on startup; close it to keep Prompt Lift available in the tray.

To create or refresh the portable Windows package:

```powershell
npm install
npm run package:win
```

The resulting entry is:

```text
release/Prompt Lift-win32-x64/Prompt Lift.exe
```

## Development run

For local development only:

```powershell
npm start
```

Focus the Codex, Claude, WeChat, or WeCom input box, then double-tap `Alt`, left-click the pet, or choose `一键处理当前输入框` from the tray icon. Prompt Lift locks the exact target window, reads the input, calls the configured model, verifies the replacement, and moves the caret to the end. The original remains available through the right-click result panel for restoration.

The assistant normally stays in compact pet mode. Right-click or open a result/settings panel to expand it; use the `收起为小宠物` button in the expanded header to return to the small pet without hiding the assistant or losing the current result/status.

Four versioned rewrite recipes are available from the right-click mode panel:

- `提示词增强`: clarify goals, context, constraints, and output requirements for AI;
- `向上沟通`: lead with the conclusion and organize evidence, risk, and the next step;
- `用户沟通`: improve politeness and clarity without inventing promises or service capabilities;
- `PPT 文案`: create a conclusion-led title and concise, hierarchical copy for the current text only.

The default fast path remains one action with automatic safe replacement. Enable `审阅后应用` when you want to compare the source and result, edit the result, regenerate it, and apply it only after confirmation. Every apply still verifies the captured window, process, expected text, and live operation token. If the model requests essential context, Prompt Lift shows up to three inline clarification prompts and regenerates in review mode without replacing the target text.

## Model setup

The UI is prefilled for Tencent Cloud TokenHub:

```text
API Base URL: https://tokenhub.tencentmaas.com/v1
Model: deepseek-v4-flash
```

Enter your API Key in the UI and click `检查并保存`. A failed check does not replace the last saved configuration; a successful check saves the verified configuration immediately. The key is never hard-coded or logged; it is encrypted with Electron `safeStorage` backed by Windows and stored in the current user's app-data directory. The password field is cleared after saving. The app calls the OpenAI-compatible `/chat/completions` endpoint over HTTPS with a `Bearer` authorization header. If the key is missing or rejected, the original prompt is not replaced.

The model path uses system-prompt protocol v2 and a versioned Recipe registry. Stable safety and output rules outrank the selected Recipe, style, and source material. Source text is serialized as untrusted rewrite material rather than executed as instructions. The protocol preserves intent and immutable anchors such as numbers, dates, links, paths, email addresses, issue identifiers, code, template variables, and command flags; it forbids invented context and avoids mechanically expanding simple requests. The model must return a mode- and language-bound JSON envelope. The client rejects truncated, polluted, cross-mode, fact-dropping, meta-rewrite, or abnormally long output before anything is written back.

The `严格保真` style is available when the user wants only necessary clarification and organization. Window size and position are saved locally and clamped back onto a visible display after monitor or resolution changes.

## Safety and limitations

- The app uses a local Windows bridge instead of injecting code into Codex or Claude. This keeps the integration reversible and independent of either app's DOM internals.
- The original prompt is kept in memory only for the current session; it is not written to disk or logged.
- The model API key is encrypted for the current Windows user; it is never included in the packaged client or source files.
- The bridge validates the target HWND and process identity, compares the current input with the originally captured text immediately before replacement, and uses atomic `SendInput` keyboard chords. User text travels as JSON over stdin rather than being interpolated into shell code.
- Clipboard content is restored after capture and replacement when it is still owned by Prompt Lift; a newer clipboard value created by the user is not overwritten.
- If the active input is not a normal editable control, capture may fail. Re-focus the prompt box and invoke the shortcut again.

## Checks

```powershell
npm test
npm run check
npm run package:win
```
