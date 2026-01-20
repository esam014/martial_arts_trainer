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
  L: { s: 11, e: 13, w: 15, h: 23 },
  R: { s: 12, e: 14, w: 16, h: 24 }
};

/*************************************************
 * UTILS
 *************************************************/
function angle(a, b, c) {
  if (!a || !b || !c) return 180;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!mag) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180 / Math.PI;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function updateWristMotion(w) {
  if (!lastWrist) {
    lastWrist = { ...w };
    return;
  }
  wristVel.x = w.x - lastWrist.x;
  wristVel.y = w.y - lastWrist.y;
  lastWrist = { ...w };
}

/*************************************************
 * PUNCH CLASSIFICATION (IMPROVED)
 *************************************************/
function classifyPunch(lm, stance) {
  const lead = stance === "Orthodox" ? J.L : J.R;
  const rear = stance === "Orthodox" ? J.R : J.L;

  const leadElbow = angle(lm[lead.s], lm[lead.e], lm[lead.w]);
  const rearElbow = angle(lm[rear.s], lm[rear.e], lm[rear.w]);

  const horiz = Math.abs(wristVel.x);
  const vert = Math.abs(wristVel.y);

  if (leadElbow > 155 && horiz > vert) return "JAB";
  if (rearElbow > 155 && horiz > vert) return "CROSS";

  if (leadElbow < 130 && horiz > vert * 1.5) return "LEAD_HOOK";
  if (rearElbow < 130 && horiz > vert * 1.5) return "REAR_HOOK";

  if (leadElbow < 130 && vert > horiz) return "LEAD_UPPERCUT";
  if (rearElbow < 130 && vert > horiz) return "REAR_UPPERCUT";

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
        punchState = "EXTENDING";
        punchPeak = elbowAngle;
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
 * SCORING (PUNCH-SPECIFIC)
 *************************************************/
function scorePunch(type, lm, stance) {
  const hipRot = Math.abs(lm[23].x - lm[24].x);
  const bal = Math.abs(lm[0].x - (lm[23].x + lm[24].x) / 2);

  let score = 50;

  if (type === "JAB") {
    score += Math.abs(wristVel.x) * 6000;
    score += (170 - punchPeak) * 1.5;
  }

  if (type === "CROSS") {
    score += hipRot * 200;
    score += (170 - punchPeak) * 2;
  }

  if (type?.includes("HOOK")) {
    score += hipRot * 250;
    score += Math.abs(wristVel.x) * 5000;
  }

  if (type?.includes("UPPERCUT")) {
    score += Math.abs(wristVel.y) * 7000;
    score += hipRot * 180;
  }

  score -= bal * 200;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/*************************************************
 * VOICE COACHING
 *************************************************/
let lastSpoken = "";
let lastSpeakTime = 0;

function speak(text) {
  const now = performance.now();
  if (text === lastSpoken && now - lastSpeakTime < 2000) return;
  lastSpoken = text;
  lastSpeakTime = now;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function coach(type, score) {
  if (score > 90) return "Excellent punch";
  if (type === "JAB" && score < 70) return "Snap the jab faster";
  if (type === "CROSS" && score < 70) return "Rotate your hips more";
  if (type?.includes("HOOK") && score < 70) return "Tighter hook, rotate more";
  if (type?.includes("UPPERCUT") && score < 70) return "Drive up with your legs";
  return null;
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
  const punch = classifyPunch(lm, stance);

  let arm = stance === "Orthodox" ? J.L : J.R;
  if (punch && punch.includes("REAR")) arm = stance === "Orthodox" ? J.R : J.L;

  updateWristMotion(lm[arm.w]);

  const elbowAngle = angle(lm[arm.s], lm[arm.e], lm[arm.w]);

  if (processPunch(elbowAngle) && punch) {
    lastScore = scorePunch(punch, lm, stance);
    const cue = coach(punch, lastScore);
    if (cue) speak(cue);
  }

  drawText(`MODE: ${currentMode}`, 20, 40);
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
