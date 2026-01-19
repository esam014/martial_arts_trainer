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
 * SAFE ANGLE
 *************************************************/
function angle(a, b, c) {
  if (!a || !b || !c) return 180;
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const mag1 = Math.hypot(abx, aby);
  const mag2 = Math.hypot(cbx, cby);
  if (mag1 < 0.001 || mag2 < 0.001) return 180;
  let cos = (abx * cbx + aby * cby) / (mag1 * mag2);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}

/*************************************************
 * STANCE
 *************************************************/
function detectStance(lm) {
  return lm[23].z < lm[24].z ? "Orthodox" : "Southpaw";
}

/*************************************************
 * PUNCH CLASSIFICATION
 *************************************************/
function classifyPunch(lm, stance) {
  const lead = stance === "Orthodox" ? J.L : J.R;
  const rear = stance === "Orthodox" ? J.R : J.L;

  const leadElbow = angle(lm[lead.s], lm[lead.e], lm[lead.w]);
  const rearElbow = angle(lm[rear.s], lm[rear.e], lm[rear.w]);

  if (leadElbow > 155) return "JAB";
  if (rearElbow > 155) return "CROSS";
  if (leadElbow < 115) return "LEAD_HOOK";
  if (rearElbow < 115) return "REAR_HOOK";
  return null;
}

/*************************************************
 * PUNCH LIFECYCLE
 *************************************************/
let punchState = "IDLE";
let punchStartTime = 0;
let punchPeakAngle = 180;
let lastScore = null;

let lastWristX = null;
let lastWristY = null;
let wristSpeed = 0;

/*************************************************
 * VOICE COACHING
 *************************************************/
let voiceEnabled = true;
let lastSpokenText = "";
let lastSpeechTime = 0;


function updateWristSpeed(wrist) {
  if (lastWristX === null) {
    lastWristX = wrist.x;
    lastWristY = wrist.y;
    return 0;
  }
  const dx = wrist.x - lastWristX;
  const dy = wrist.y - lastWristY;
  lastWristX = wrist.x;
  lastWristY = wrist.y;
  return Math.hypot(dx, dy);
}

function processPunch(elbowAngle, wrist, now) {
  wristSpeed = 0.8 * wristSpeed + 0.2 * updateWristSpeed(wrist);

  switch (punchState) {
    case "IDLE":
      if (elbowAngle < 150 && wristSpeed > 0.01) {
        punchState = "EXTENDING";
        punchStartTime = now;
        punchPeakAngle = elbowAngle;
      }
      break;

    case "EXTENDING":
      punchPeakAngle = Math.min(punchPeakAngle, elbowAngle);
      if (elbowAngle > 165) punchState = "FULL";
      break;

    case "FULL":
      if (elbowAngle < 150) punchState = "RETRACTING";
      break;

    case "RETRACTING":
      punchState = "COMPLETE";
      break;
  }

  if (punchState === "COMPLETE") {
    punchState = "IDLE";
    return true;
  }
  return false;
}

/*************************************************
 * SCORING
 *************************************************/
function balanceError(lm) {
  const head = lm[0];
  const hipsX = (lm[23].x + lm[24].x) / 2;
  return Math.abs(head.x - hipsX);
}

function shoulderRotation(lm) {
  return Math.abs(lm[11].x - lm[12].x);
}

function scorePunch(elbowMin, wristSpeed, balErr, rot) {
  const extension = Math.min(100, (170 - elbowMin) * 2);
  const speed = Math.min(100, wristSpeed * 6000);
  const balance = Math.max(0, 100 - balErr * 300);
  const rotation = Math.min(100, rot * 120);

  return Math.round(
    extension * 0.35 +
    speed * 0.30 +
    balance * 0.20 +
    rotation * 0.15
  );
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

  drawConnectors(ctx, lm, POSE_CONNECTIONS, {
    color: "#00ff00",
    lineWidth: 4
  });

  drawLandmarks(ctx, lm, {
    color: "#ff0000",
    radius: 3
  });

  if (!currentMode) return;

  const stance = detectStance(lm);
  const punch = classifyPunch(lm, stance);

  let arm = stance === "Orthodox" ? J.L : J.R;
  if (punch && punch.includes("REAR")) {
    arm = stance === "Orthodox" ? J.R : J.L;
  }

  const elbowAngle = angle(lm[arm.s], lm[arm.e], lm[arm.w]);
  const now = performance.now();

  if (processPunch(elbowAngle, lm[arm.w], now)) {
  lastScore = scorePunch(
    punchPeakAngle,
    wristSpeed,
    balanceError(lm),
    shoulderRotation(lm)
  );

  const cue = voiceCoach(punch, lastScore, lm, stance);
if (cue) speak(cue);

}


  drawText(`MODE: ${currentMode}`, 20, 40);
  drawText(`STANCE: ${stance}`, 20, 70);
  drawText(`STATE: ${punchState}`, 20, 100);
  drawText(`PUNCH: ${punch || "None"}`, 20, 130);

  if (lastScore !== null) {
    drawText(`SCORE: ${lastScore}/100`, 20, 170);
  }

  if (currentMode === "STANCE") {
  const issues = stanceIssues(lm, stance);
  if (issues.length > 0) {
    speak(issues[0]);
  } else {
    speak("Good stance");
  }
}

}

/*************************************************
 * TEXT
 *************************************************/
function drawText(text, x, y) {
  ctx.fillStyle = "yellow";
  ctx.font = "24px Arial";
  ctx.fillText(text, x, y);
}

function speak(text) {
  if (!voiceEnabled) return;

  const now = performance.now();

  // Prevent spam
  if (text === lastSpokenText && now - lastSpeechTime < 2000) return;

  lastSpokenText = text;
  lastSpeechTime = now;

  // Cancel previous speech to stay responsive
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Prefer a natural English voice if available
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;

  speechSynthesis.speak(utterance);
}


function voiceCoach(punch, score, lm, stance) {
  // Praise first
  if (score >= 95) return "Excellent technique";
  if (score >= 88) return "Very sharp punch";

  // Punch-specific corrections
  if (punch === "JAB" && score < 75)
    return "Snap the jab and bring it back fast";

  if (punch === "CROSS" && score < 75)
    return "Rotate your hips and shoulder on the cross";

  if (punch && punch.includes("HOOK") && score < 75)
    return "Keep the elbow bent and rotate";

  // Stance coaching (when in stance mode or poor balance)
  const issues = stanceIssues(lm, stance);
  if (issues.length > 0) {
    return issues[0]; // speak only ONE correction
  }

  // Generic fallback
  if (score < 70) return "Focus on balance and control";

  return null;
}


/*************************************************
 * STANCE ANALYSIS
 *************************************************/
function stanceIssues(lm, stance) {
  const issues = [];

  const leadHip = stance === "Orthodox" ? lm[23] : lm[24];
  const rearHip = stance === "Orthodox" ? lm[24] : lm[23];

  const leadFoot = stance === "Orthodox" ? lm[31] : lm[32];
  const rearFoot = stance === "Orthodox" ? lm[32] : lm[31];

  // Foot width (too narrow or too wide)
  const footWidth = Math.abs(leadFoot.x - rearFoot.x);
  if (footWidth < 0.08) issues.push("Feet too narrow");
  if (footWidth > 0.25) issues.push("Feet too wide");

  // Weight distribution (head over hips)
  const head = lm[0];
  const hipsX = (lm[23].x + lm[24].x) / 2;
  if (Math.abs(head.x - hipsX) > 0.06)
    issues.push("Keep your head centered");

  // Square stance (hips too parallel)
  const hipRotation = Math.abs(lm[23].x - lm[24].x);
  if (hipRotation < 0.04)
    issues.push("Turn your hips sideways");

  // Guard height
  const leadHand = stance === "Orthodox" ? lm[15] : lm[16];
  if (leadHand.y > lm[0].y + 0.15)
    issues.push("Keep your hands up");

  return issues;
}
