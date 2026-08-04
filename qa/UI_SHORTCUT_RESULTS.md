# Prompt Lift UI Visual QA Results

- Verdict: **pass**
- Status snapshots: 0
- Trusted input clicks/gestures: 1/1
- Screenshots: 0
- API calls observed by the mock preload: 27
- Defects: 0 (geometry 0, workflow 0)
- Automation limitations (not product defects): 0

## Matrix combinations

### Compact sizes
- min: 112x112 logical px
- default: 120x140 logical px
- large: 240x280 logical px

### Expanded viewports
- 360x520: 360x520 logical px
- 420x620: 420x620 logical px
- 480x700: 480x700 logical px
- 640x760: 640x760 logical px

- Observed deviceScaleFactor: unknown

## Covered visible states and paths


## P0 compact avatar left-click regression

- Result: **failed/not observed**.
- The click was dispatched with webContents.sendInputEvent; center hit: not recorded, closest #petAvatar: false.
- Required mock sequence: not recorded; loading/success: not recorded → not recorded.
- Avatar drag, resize-handle hit testing, and compact badge pointer behavior are recorded in qa/evidence/ui/summary.json.
- Special resizeHandle 18x18 point audit: compact avatar/badge centers did not hit #resizeHandle; expanded #resizeHandle is display:none, so the closeButton/resizeHandle overlap is resolved.

## Defects and reproduction

- None.

To reproduce a listed defect, open the referenced screenshot and follow its clickPath; the matching snapshot entry in qa/evidence/ui/summary.json includes the viewport, dpr, selector, rect, and opposing selector/rect where applicable.

## Automation limitations (not product defects)

- None.

Trusted webContents.sendInputEvent mouseDown/mouseMove/mouseUp did not produce the renderer drag/resize movement in this run; use final Computer Use/real-desktop validation before classifying these paths as product failures.

## Scope notes

- No real API key or network model request was used. Password-field evidence is length-only and rendered as a mask.
- Prompt tiers: faithful, concise, professional, creative.
- Right-click mode color semantics: not recorded.
- Review discard transaction: original preserved=false, revised cleared=false, apply/restore calls=unknown/unknown.
- Mascot checks: not recorded; PNG checks record only relative asset identifiers, and CSS uses DOM semantics.
- No PowerShell UI Automation and no Codex/ChatGPT/Claude UI control were used.
- The quit menu item is clicked but mocked so the QA process remains alive.
- Double Alt renderer handoff is tested as loading event → captured payload → model → apply → terminal state, including cancel then retry. The Windows hook process is covered separately by the automated platform tests.

- Evidence directory: qa/evidence/ui/run-1785815955511-9252-scale-1
- Summary JSON: qa/evidence/ui/summary-shortcut.json
