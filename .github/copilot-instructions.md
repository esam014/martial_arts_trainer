# Copilot Instructions — Boxing Coach (martial_arts_trainer)

This repository is a single-page web app that runs MediaPipe Pose in the browser to detect and score boxing punches. Use this file to quickly orient AI coding agents to the project's structure, data flow, and conventions.

- **Big picture:** `index.html` loads MediaPipe via CDN and mounts `script.js`. `script.js` is the app controller: it starts the camera, receives `poseLandmarks` in `onResults()`, classifies punches, runs a punch state machine, scores punches, and triggers voice cues. The `ml/` folder contains extraction and logging helpers (`ml/featureExtractor.js`, `ml/dataLogger.js`).

- **Key files:**
  - `index.html` — UI (buttons for modes) and MediaPipe includes.
  - `script.js` — core logic: joint map `J`, `classifyPunch()`, `processPunch()` state machine, scoring (`scorePunch()`), and `onResults()` loop.
  - `ml/featureExtractor.js` — feature vector generator; preserves ordering and units expected by ML models.
  - `ml/dataLogger.js` — persistent sample storage using `localStorage` key `jab_samples`.

- **Data flow and units:**
  - Video -> MediaPipe Pose -> `onResults(res)` -> `res.poseLandmarks` (array of landmarks).
  - Angles are in degrees (see `angle()`); velocities in `featureExtractor` are normalized by `shoulderWidth` when applicable.
  - Feature vector order (important):
    `elbowAngle, elbowVel, elbowAcc, wristVel, wristAcc, shoulderRot, shoulderVel, hipRot, hipVel, guardHeight, headDisp, headVel, phaseOneHot(4), phaseTime`.

- **State & conventions to preserve:**
  - Punch lifecycle states: `IDLE`, `EXTENDING`, `FULL`, `RETRACTING`, `COMPLETE` (see `processPunch()` and `featureExtractor` phase one-hot encoding).
  - Joint mapping shorthand: `J.L` and `J.R` in `script.js` (indices for shoulder/elbow/wrist); keep this naming when modifying classification.
  - Scoring formula lives in `scorePunch()` — if you change feature normalization, update this function and retrain models accordingly.

- **Where to make common changes:**
  - Add new punch types: update `classifyPunch()` and possibly `J` mapping if new joints are used.
  - Change ML features: edit `ml/featureExtractor.js` and ensure downstream consumers expect the same vector shape/order.
  - Persist or export samples: modify `ml/dataLogger.js` (currently uses `localStorage` key `jab_samples`).

- **Integration & external deps:**
  - MediaPipe is included from CDN in `index.html` (no npm packages). Any change to MediaPipe imports should keep `locateFile` usage in `script.js`.
  - Speech feedback uses the browser `speechSynthesis` API; tests and automation should mock or stub it.

- **Developer workflows (discoverable):**
  - Run locally by opening `index.html` in a browser or serve the folder with any static server (e.g., VS Code Live Server or `python -m http.server`).
  - Debugging: use the browser DevTools console; `onResults()` runs at camera frame-rate so add `console.log()` or breakpoints inside `onResults`, `classifyPunch()`, or `processPunch()`.

- **Examples to reference in changes:**
  - To add a debug metric, add it to `featureExtractor.debug` and mirror it into the object stored by `ml/dataLogger.js`.
  - To change stance logic, edit `detectStance()` in `script.js` (currently compares `lm[23].z` and `lm[24].z`).

- **Non-goals / avoid guessing:**
  - Do not change the feature vector ordering or scale without updating all consumers (scoring + any model training code).
  - There are no build scripts or CI in this repo—changes are mainly small edits to JS/HTML/CSS and tested in the browser.

If any section is unclear or you need more specifics (for example: desired model input normalization, export format for samples, or a CI plan), tell me which part to expand and I will update this file.
