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
 * UI CONTROLS
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
 * MEDIAPIPE SETUP
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
 * CAMERA (USER-GESTURE SAFE)
 *************************************************/
let processing = false;
let camera = null;

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
 * SAFE ANGLE MATH
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
 * STANCE DETECTION
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
 * COACHING
 *************************************************/
function coachPunch(type, elbowAngle) {
  if (!type) return "Throw the selected punch";

  if (type === "JAB" && elbowAngle < 160)
    return "Extend your jab fully";

  if (type === "CROSS" && elbowAngle < 165)
    return "Rotate shoulder & hips on the cross";

  if (type.includes("HOOK") && elbowAngle > 120)
    return "Tighten the hook — elbow bent";

  return "Good form";
}

/*************************************************
 * MAIN RENDER LOOP
 *************************************************/
function onResults(res) {
  if (!res.poseLandmarks) return;

  // Resize canvas every frame (fixes invisible overlay)
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lm = res.poseLandmarks;

  // Always draw overlay
  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: "#00ff00", lineWidth: 4 });
  drawLandmarks(ctx, lm, { color: "#ff0000", lineWidth: 2 });

  if (!currentMode) return;

  const stance = detectStance(lm);
  const punch = classifyPunch(lm, stance);

  let arm = stance === "Orthodox" ? J.L : J.R;
  if (punch && punch.includes("REAR")) arm = stance === "Orthodox" ? J.R : J.L;

  const elbowAngle = angle(lm[arm.s], lm[arm.e], lm[arm.w]);
  const feedback = currentMode === "STANCE"
    ? `Stance: ${stance}`
    : coachPunch(punch, elbowAngle);

  drawText(`MODE: ${currentMode}`, 20, 40);
  drawText(`STANCE: ${stance}`, 20, 70);
  drawText(`DETECTED: ${punch || "None"}`, 20, 100);
  drawText(`COACH: ${feedback}`, 20, 140);
}

/*************************************************
 * TEXT
 *************************************************/
function drawText(text, x, y) {
  ctx.fillStyle = "yellow";
  ctx.font = "24px Arial";
  ctx.fillText(text, x, y);
}
