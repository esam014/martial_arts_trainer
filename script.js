/*************************************************
 * DOM
 *************************************************/
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

/*************************************************
 * SESSION STATE
 *************************************************/
let currentMode = null;
let cameraStarted = false;

/*************************************************
 * UI
 *************************************************/
function startSession(mode) {
  currentMode = mode;
  lastScore = null;
  punchState = "IDLE";
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("training").classList.remove("hidden");
  if (!cameraStarted) startCamera();
}

function endSession() {
  currentMode = null;
  document.getElementById("training").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
}

/*************************************************
 * MEDIAPIPE
 *************************************************/
const pose = new Pose({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

pose.onResults(onResults);

/*************************************************
 * CAMERA
 *************************************************/
let camera = null;
let processing = false;

function startCamera() {
  cameraStarted = true;
  camera = new Camera(video, {
    onFrame: async () => {
      if (processing) return;
      processing = true;
      await pose.send({ image: video });
      processing = false;
    },
    width: 1280,
    height: 720
  });
  camera.start();
}

/*************************************************
 * JOINT MAP
 *************************************************/
const J = {
  L: { s: 11, e: 13, w: 15 },
  R: { s: 12, e: 14, w: 16 }
};

/*************************************************
 * MATH UTILS
 *************************************************/
function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!mag) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180 / Math.PI;
}

/*************************************************
 * STANCE
 *************************************************/
function detectStance(lm) {
  return lm[23].z < lm[24].z ? "Orthodox" : "Southpaw";
}

/*************************************************
 * MOTION TRACKING
 *************************************************/
let lastWrist = null;
let wristVel = { x: 0, y: 0 };

function updateWrist(w) {
  if (!lastWrist) {
    lastWrist = { ...w };
    return;
  }
  wristVel.x = w.x - lastWrist.x;
  wristVel.y = w.y - lastWrist.y;
  lastWrist = { ...w };
}

/*************************************************
 * PUNCH CLASSIFICATION
 *************************************************/
function classifyPunch(lm, stance) {
  const lead = stance === "Orthodox" ? J.L : J.R;
  const rear = stance === "Orthodox" ? J.R : J.L;

  const leadElbow = angle(lm[lead.s], lm[lead.e], lm[lead.w]);
  const rearElbow = angle(lm[rear.s], lm[rear.e], lm[rear.w]);

  const h = Math.abs(wristVel.x);
  const v = Math.abs(wristVel.y);

  if (leadElbow > 155 && h > v) return "JAB";
  if (rearElbow > 155 && h > v) return "CROSS";

  if (leadElbow < 130 && h > v * 1.5) return "LEAD_HOOK";
  if (rearElbow < 130 && h > v * 1.5) return "REAR_HOOK";

  if (leadElbow < 130 && v > h) return "LEAD_UPPERCUT";
  if (rearElbow < 130 && v > h) return "REAR_UPPERCUT";

  return null;
}

/*************************************************
 * PUNCH LIFECYCLE
 *************************************************/
let punchState = "IDLE";
let punchPeak = 180;
let lastScore = null;

function processPunch(elbowAngle) {
  switch (punchState) {
    case "IDLE":
      if (elbowAngle < 150) {
        punchPeak = elbowAngle;
        punchState = "EXTENDING";
      }
      break;
    case "EXTENDING":
      punchPeak = Math.min(punchPeak, elbowAngle);
      if (elbowAngle > 165) punchState = "FULL";
      break;
    case "FULL":
      if (elbowAngle < 150) punchState = "RETRACTING";
      break;
    case "RETRACTING":
      punchState = "IDLE";
      return true;
  }
  return false;
}

/*************************************************
 * SCORING
 *************************************************/
function scorePunch(type, lm) {
  const hipRot = Math.abs(lm[23].x - lm[24].x);
  const balance = Math.abs(lm[0].x - (lm[23].x + lm[24].x) / 2);

  let score = 50;

  if (type === "JAB") {
    score += Math.abs(wristVel.x) * 6000;
    score += (170 - punchPeak) * 1.5;
  }

  if (type === "CROSS") {
    score += hipRot * 220;
    score += (170 - punchPeak) * 2;
  }

  if (type.includes("HOOK")) {
    score += hipRot * 260;
    score += Math.abs(wristVel.x) * 5000;
  }

  if (type.includes("UPPERCUT")) {
    score += Math.abs(wristVel.y) * 7000;
    score += hipRot * 200;
  }

  score -= balance * 220;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/*************************************************
 * VOICE COACHING
 *************************************************/
let lastSpeech = "";
let lastSpeechTime = 0;

function speak(text) {
  const now = performance.now();
  if (text === lastSpeech && now - lastSpeechTime < 2000) return;
  lastSpeech = text;
  lastSpeechTime = now;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function coach(type, score) {
  if (score >= 90) return "Excellent";
  if (type === "JAB" && score < 70) return "Snap the jab and retract";
  if (type === "CROSS" && score < 70) return "Rotate hips and shoulder";
  if (type.includes("HOOK") && score < 70) return "Tighter hook and rotation";
  if (type.includes("UPPERCUT") && score < 70) return "Drive upward with legs";
  return null;
}

/*************************************************
 * STANCE COACHING
 *************************************************/
function stanceIssues(lm) {
  const issues = [];
  const hipsX = (lm[23].x + lm[24].x) / 2;
  if (Math.abs(lm[0].x - hipsX) > 0.06)
    issues.push("Keep your head centered");
  if (Math.abs(lm[11].x - lm[12].x) < 0.04)
    issues.push("Turn your shoulders sideways");
  return issues;
}

/*************************************************
 * MAIN LOOP
 *************************************************/
function onResults(res) {
  if (!res.poseLandmarks) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lm = res.poseLandmarks;

  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: "#00ff00", lineWidth: 4 });
  drawLandmarks(ctx, lm, { color: "#ff0000", radius: 3 });

  if (!currentMode) return;

  const stance = detectStance(lm);

  // STANCE-ONLY MODE
  if (currentMode === "STANCE") {
    const issues = stanceIssues(lm);
    drawText("STANCE COACHING", 20, 40);
    if (issues.length) speak(issues[0]);
    return;
  }

  const punch = classifyPunch(lm, stance);

  let arm = stance === "Orthodox" ? J.L : J.R;
  if (punch && punch.includes("REAR")) arm = stance === "Orthodox" ? J.R : J.L;

  updateWrist(lm[arm.w]);
  const elbowAngle = angle(lm[arm.s], lm[arm.e], lm[arm.w]);

  if (processPunch(elbowAngle)) {

    // Wrong or missing punch
    if (!punch || punch !== currentMode) {
      lastScore = 0;
      speak(`That was not a ${currentMode.toLowerCase()}`);
      return;
    }

    // Correct punch
    lastScore = scorePunch(punch, lm);
    const cue = coach(punch, lastScore);
    if (cue) speak(cue);
  }

  drawText(`DRILL: ${currentMode}`, 20, 40);
  drawText(`STANCE: ${stance}`, 20, 70);
  drawText(`PUNCH: ${punch || "-"}`, 20, 100);
  if (lastScore !== null) drawText(`SCORE: ${lastScore}`, 20, 140);
}

/*************************************************
 * TEXT
 *************************************************/
function drawText(text, x, y) {
  ctx.fillStyle = "yellow";
  ctx.font = "24px Arial";
  ctx.fillText(text, x, y);
}
