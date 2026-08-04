# Prompt Lift UI Visual QA Results

- Verdict: **pass**
- Status snapshots: 82
- Trusted input clicks/gestures: 177/189
- Screenshots: 82
- API calls observed by the mock preload: 355
- Defects: 0 (geometry 0, workflow 0)
- Automation limitations (not product defects): 2

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

- Observed deviceScaleFactor: 2

## Covered visible states and paths

- compact-idle-min-112x112: compact/idle, viewport 112x112, dpr 2, 1 visible interactive elements; path: compact idle at 112x112; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/001-compact-idle-min-112x112.png
- compact-idle-default-120x140: compact/idle, viewport 120x140, dpr 2, 1 visible interactive elements; path: compact idle at 120x140; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/002-compact-idle-default-120x140.png
- compact-idle-large-240x280: compact/idle, viewport 240x280, dpr 2, 1 visible interactive elements; path: compact idle at 240x280; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/003-compact-idle-large-240x280.png
- compact-idle-p0-before-left-click: compact/idle, viewport 120x140, dpr 2, 1 visible interactive elements; path: compact idle → #petAvatar left click; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/004-compact-idle-p0-before-left-click.png
- compact-loading-p0-avatar: compact/loading, viewport 120x140, dpr 2, 2 visible interactive elements; path: #petAvatar left click → loading; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/005-compact-loading-p0-avatar.png
- compact-success-p0-avatar: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: #petAvatar left click → capture → enhance → auto apply → compact; fast mode success; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/006-compact-success-p0-avatar.png
- compact-loading-cancel-available: compact/loading, viewport 120x140, dpr 2, 2 visible interactive elements; path: #petAvatar left click → compact loading; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/007-compact-loading-cancel-available.png
- compact-loading-cancelled: compact/idle, viewport 120x140, dpr 2, 1 visible interactive elements; path: compact loading → #compactCancelButton; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/008-compact-loading-cancelled.png
- expanded-error-before-collapse: expanded/error, viewport 360x520, dpr 2, 5 visible interactive elements; path: compact #petAvatar → error → expanded; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/009-expanded-error-before-collapse.png
- compact-error-after-collapse: compact/error, viewport 120x140, dpr 2, 1 visible interactive elements; path: expanded error → #collapseButton → compact error; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/010-compact-error-after-collapse.png
- expanded-idle-context-360x520: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: compact idle → right-click #petAvatar → expanded context at 360x520; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/011-expanded-idle-context-360x520.png
- expanded-idle-context-420x620: expanded/idle, viewport 420x620, dpr 2, 16 visible interactive elements; path: compact idle → right-click #petAvatar → expanded context at 420x620; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/012-expanded-idle-context-420x620.png
- expanded-idle-context-480x700: expanded/idle, viewport 480x700, dpr 2, 16 visible interactive elements; path: compact idle → right-click #petAvatar → expanded context at 480x700; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/013-expanded-idle-context-480x700.png
- expanded-idle-context-640x760: expanded/idle, viewport 640x760, dpr 2, 16 visible interactive elements; path: compact idle → right-click #petAvatar → expanded context at 640x760; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/014-expanded-idle-context-640x760.png
- expanded-loading-model-check: expanded/loading, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → check model → loading; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/015-expanded-loading-model-check.png
- expanded-success-model-check: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: check model → success; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/016-expanded-success-model-check.png
- expanded-error-model-check: expanded/error, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → check model → error; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/017-expanded-error-model-check.png
- compact-success-fast-auto-apply: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: fast mode success → auto apply → compact; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/018-compact-success-fast-auto-apply.png
- compact-review-discard-preserved-original: compact/idle, viewport 120x140, dpr 2, 1 visible interactive elements; path: review pending → discard → compact; original transaction preserved; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/019-compact-review-discard-preserved-original.png
- expanded-needs-input-clarification-boundary: expanded/error, viewport 360x520, dpr 2, 7 visible interactive elements; path: model needs input → bounded clarification panel; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/020-expanded-needs-input-clarification-boundary.png
- expanded-review-pending-actions: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: review mode success → primary result region → pending actions; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/021-expanded-review-pending-actions.png
- expanded-review-hub-continue: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: pending review result → product hub → continue review; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/022-expanded-review-hub-continue.png
- expanded-review-resumed-without-regenerate: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: product hub → continue review → existing result; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/023-expanded-review-resumed-without-regenerate.png
- expanded-review-applied-actions: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: review result → explicit apply → applied actions; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/024-expanded-review-applied-actions.png
- expanded-review-topbar-menu-open: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: review result → topbar menu entry → context menu; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/025-expanded-review-topbar-menu-open.png
- hub-page-process: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: four-area hub → process; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/026-hub-page-process.png
- hub-page-scenes: expanded/idle, viewport 360x520, dpr 2, 12 visible interactive elements; path: four-area hub → scenes; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/027-hub-page-scenes.png
- hub-page-services: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: four-area hub → services; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/028-hub-page-services.png
- hub-page-profile: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: four-area hub → profile; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/029-hub-page-profile.png
- context-menu-before-mode: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → mode; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/030-context-menu-before-mode.png
- context-mode-panel: expanded/idle, viewport 360x520, dpr 2, 9 visible interactive elements; path: context menu → mode; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/031-context-mode-panel.png
- context-menu-before-mascot: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → mascot; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/032-context-menu-before-mascot.png
- context-mascot-panel: expanded/idle, viewport 360x520, dpr 2, 8 visible interactive elements; path: context menu → mascot; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/033-context-mascot-panel.png
- context-menu-before-review: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → review; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/034-context-menu-before-review.png
- context-startup-visible: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: context menu → startup; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/035-context-startup-visible.png
- context-menu-before-configure: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → configure; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/036-context-menu-before-configure.png
- context-configure-panel: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → configure; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/037-context-configure-panel.png
- context-menu-before-style: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → style; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/038-context-menu-before-style.png
- context-style-panel: expanded/idle, viewport 360x520, dpr 2, 10 visible interactive elements; path: context menu → style; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/039-context-style-panel.png
- context-menu-before-check: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → check; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/040-context-menu-before-check.png
- context-check-panel: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → check; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/041-context-check-panel.png
- context-menu-before-startup: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → startup; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/042-context-menu-before-startup.png
- context-startup-visible: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → startup; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/043-context-startup-visible.png
- context-menu-before-help: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → help; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/044-context-menu-before-help.png
- context-help-panel: expanded/idle, viewport 360x520, dpr 2, 5 visible interactive elements; path: context menu → help; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/045-context-help-panel.png
- context-menu-before-quit: expanded/idle, viewport 360x520, dpr 2, 16 visible interactive elements; path: trusted right click #petAvatar → quit; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/046-context-menu-before-quit.png
- context-menu-quit-visible: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → quit (mocked, process retained); screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/047-context-menu-quit-visible.png
- mode-selection-returns-parent-menu: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: mode option → parent menu remains open; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/048-mode-selection-returns-parent-menu.png
- mode-right-click-enhance: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: right-click mode toggle → enhance; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/049-mode-right-click-enhance.png
- mode-right-click-upward-communication: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: right-click mode toggle → upward-communication; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/050-mode-right-click-upward-communication.png
- mode-right-click-chat-polish: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: right-click mode toggle → chat-polish; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/051-mode-right-click-chat-polish.png
- mode-right-click-ppt-copy: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: right-click mode toggle → ppt-copy; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/052-mode-right-click-ppt-copy.png
- tier-labels-enhance: expanded/success, viewport 360x520, dpr 2, 10 visible interactive elements; path: mode enhance → four visible tier labels; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/053-tier-labels-enhance.png
- tier-labels-upward-communication: expanded/success, viewport 360x520, dpr 2, 10 visible interactive elements; path: mode upward-communication → four visible tier labels; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/054-tier-labels-upward-communication.png
- tier-labels-chat-polish: expanded/success, viewport 360x520, dpr 2, 10 visible interactive elements; path: mode chat-polish → four visible tier labels; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/055-tier-labels-chat-polish.png
- tier-labels-ppt-copy: expanded/success, viewport 360x520, dpr 2, 10 visible interactive elements; path: mode ppt-copy → four visible tier labels; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/056-tier-labels-ppt-copy.png
- system-prompt-editor-dirty: expanded/idle, viewport 360x520, dpr 2, 14 visible interactive elements; path: system prompt editor → local custom rule; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/057-system-prompt-editor-dirty.png
- system-prompt-editor-saved: expanded/idle, viewport 360x520, dpr 2, 14 visible interactive elements; path: system prompt editor → saved effective preview; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/058-system-prompt-editor-saved.png
- system-prompt-editor-reset: expanded/idle, viewport 360x520, dpr 2, 14 visible interactive elements; path: system prompt editor → restore default; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/059-system-prompt-editor-reset.png
- settings-fields-initial: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → model settings; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/060-settings-fields-initial.png
- settings-api-key-masked: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: settings API Key/title inputs typed; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/061-settings-api-key-masked.png
- services-model-config-dirty: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: edited settings → services hub → pending save; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/062-services-model-config-dirty.png
- settings-check-save-success: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: settings → 检查并保存 → success; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/063-settings-check-save-success.png
- services-model-connected: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: checked settings → services hub → connected; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/064-services-model-connected.png
- settings-check-error: expanded/error, viewport 360x520, dpr 2, 11 visible interactive elements; path: settings → 检查并保存 → error; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/065-settings-check-error.png
- services-model-check-failed: expanded/error, viewport 360x520, dpr 2, 11 visible interactive elements; path: failed check → services hub → check failed; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/066-services-model-check-failed.png
- settings-save-error: expanded/error, viewport 360x520, dpr 2, 11 visible interactive elements; path: settings → 保存配置 → error; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/067-settings-save-error.png
- settings-save-success: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: settings → 保存配置 → success; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/068-settings-save-success.png
- style-selected-faithful: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: style option → faithful → parent hub; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/069-style-selected-faithful.png
- style-selected-concise: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: style option → concise → parent hub; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/070-style-selected-concise.png
- style-selected-professional: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: style option → professional → parent hub; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/071-style-selected-professional.png
- style-selected-creative: expanded/success, viewport 360x520, dpr 2, 16 visible interactive elements; path: style option → creative → parent hub; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/072-style-selected-creative.png
- mascot-selected-cockapoo: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: mascot option → cockapoo; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/073-mascot-selected-cockapoo.png
- mascot-selected-green-knight-pup: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: mascot option → green-knight-pup; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/074-mascot-selected-green-knight-pup.png
- mascot-selected-classic-green-knight: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: mascot option → classic-green-knight; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/075-mascot-selected-classic-green-knight.png
- startup-enabled: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → startup on; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/076-startup-enabled.png
- startup-disabled: expanded/success, viewport 360x520, dpr 2, 11 visible interactive elements; path: context menu → startup off; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/077-startup-disabled.png
- close-button-window-restored: expanded/idle, viewport 360x520, dpr 2, 11 visible interactive elements; path: #closeButton → hidden → QA runner show; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/078-close-button-window-restored.png
- compact-overlay-before-drag: compact/idle, viewport 120x140, dpr 2, 1 visible interactive elements; path: compact overlay hit test; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/079-compact-overlay-before-drag.png
- compact-avatar-dragged: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: compact avatar pointer drag; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/080-compact-avatar-dragged.png
- failure-avatar-drag-and-overlay-hit-tests: compact/success, viewport 120x140, dpr 2, 1 visible interactive elements; path: failure:avatar-drag-and-overlay-hit-tests; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/081-failure-avatar-drag-and-overlay-hit-tests.png
- failure-resize-handle: compact/idle, viewport 240x280, dpr 2, 1 visible interactive elements; path: failure:resize-handle; screenshot: qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/082-failure-resize-handle.png

## P0 compact avatar left-click regression

- Result: **passed**.
- The click was dispatched with webContents.sendInputEvent; center hit: #mascotImageFrame, closest #petAvatar: true.
- Required mock sequence: capture → enhance → apply; loading/success: loading → success.
- Avatar drag, resize-handle hit testing, and compact badge pointer behavior are recorded in qa/evidence/ui/summary.json.
- Special resizeHandle 18x18 point audit: compact avatar/badge centers did not hit #resizeHandle; expanded #resizeHandle is display:none, so the closeButton/resizeHandle overlap is resolved.

## Defects and reproduction

- None.

To reproduce a listed defect, open the referenced screenshot and follow its clickPath; the matching snapshot entry in qa/evidence/ui/summary.json includes the viewport, dpr, selector, rect, and opposing selector/rect where applicable.

## Automation limitations (not product defects)

1. **avatar-drag-and-overlay-hit-tests**: avatar drag intercepted click flow: dragging=false, operationCalls=3; selector #petAvatar rect {"x":0,"y":0,"width":120,"height":60}; against #resizeHandle rect {"x":0,"y":0,"width":0,"height":0}; screenshot qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/081-failure-avatar-drag-and-overlay-hit-tests.png
2. **resize-handle**: cannot drag hidden element #resizeHandle; selector workflow; screenshot qa/evidence/ui/run-1785812845291-60084-scale-1/screenshots/082-failure-resize-handle.png

Trusted webContents.sendInputEvent mouseDown/mouseMove/mouseUp did not produce the renderer drag/resize movement in this run; use final Computer Use/real-desktop validation before classifying these paths as product failures.

## Scope notes

- No real API key or network model request was used. Password-field evidence is length-only and rendered as a mask.
- Prompt tiers: faithful, concise, professional, creative.
- Right-click mode color semantics: enhance=#07c160, upward-communication=#3478f6, chat-polish=#f59a23, ppt-copy=#8b5cf6.
- Review discard transaction: original preserved=true, revised cleared=true, apply/restore calls=0/0.
- Mascot checks: cockapoo PNG 1254x1254, green-knight-pup PNG 1254x1254, classic-green-knight CSS semantic 60x60; PNG checks record only relative asset identifiers, and CSS uses DOM semantics.
- No PowerShell UI Automation and no Codex/ChatGPT/Claude UI control were used.
- The quit menu item is clicked but mocked so the QA process remains alive.
- Double Alt renderer handoff is tested as loading event → captured payload → model → apply → terminal state, including cancel then retry. The Windows hook process is covered separately by the automated platform tests.

- Evidence directory: qa/evidence/ui/run-1785812845291-60084-scale-1
- Summary JSON: qa/evidence/ui/summary.json
