/*************************************************
 * DOM SETUP
 *************************************************/
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

/*************************************************
 * MEDIAPIPE POSE
 *************************************************/
const pose = new Pose({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

pose.onResults(onResults);

/*************************************************
 * CAMERA (FRAME SAFE)
 *************************************************/
let processingFrame = false;

const camera = new Camera(video, {
  onFrame: async () => {
    if (processingFrame) return;
    processingFrame = true;
    await pose.send({ image: video });
    processingFrame = false;
  },
  width: 1280,
  height: 720,
});
camera.start();

/*************************************************
 * JOINT MAP
 *************************************************/
const J = {
  L: { s: 11, e: 13, w: 15, h: 23, k: 25, a: 27, f: 31 },
  R: { s: 12, e: 14, w: 16, h: 24, k: 26, a: 28, f: 32 },
};

/*************************************************
 * SAFE MATH
 *************************************************/
function angle(a, b, c) {
  if (!a || !b || !c) return 180;

  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB < 0.0001 || magCB < 0.0001) return 180;

  let cos = (abx * cbx + aby * cby) / (magAB * magCB);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * (180 / Math.PI);
}

function hasLandmark(lm, i) {
  return lm[i] && lm[i].visibility > 0.4;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/*************************************************
 * HISTORY & PERSONALIZATION
 *************************************************/
const stanceHistory = [];
const HISTORY_LIMIT = 300;

const mistakeCounter = {
  guardDrop: 0,
  narrowStance: 0,
  poorBalance: 0,
  lockedKnees: 0,
  badFootAngle: 0,
};

/*************************************************
 * STANCE ANALYSIS
 *************************************************/
function analyzeStance(lm, isPunching) {
  let score = 100;
  const feedback = [];

  const stance =
    lm[J.L.a].z < lm[J.R.a].z ? "Orthodox" : "Southpaw";

  // Balance
  const footWidth = Math.abs(lm[J.L.a].x - lm[J.R.a].x);
  const hipWidth = Math.abs(lm[J.L.h].x - lm[J.R.h].x);

  if (footWidth < hipWidth * 1.15) {
    score -= 12;
    mistakeCounter.narrowStance++;
    feedback.push("Widen your stance for better balance");
  }

  const feetCenter = (lm[J.L.a].x + lm[J.R.a].x) / 2;
  const hipCenter = (lm[J.L.h].x + lm[J.R.h].x) / 2;

  if (Math.abs(feetCenter - hipCenter) > 0.06) {
    score -= 10;
    mistakeCounter.poorBalance++;
    feedback.push("Keep your weight centered");
  }

  // Mobility
  const leftKnee = angle(lm[J.L.h], lm[J.L.k], lm[J.L.a]);
  const rightKnee = angle(lm[J.R.h], lm[J.R.k], lm[J.R.a]);

  if (leftKnee > 175 || rightKnee > 175) {
    score -= 10;
    mistakeCounter.lockedKnees++;
    feedback.push("Bend your knees slightly");
  }

  // Foot angles
  const lead = stance === "Orthodox" ? J.L : J.R;
  const rear = stance === "Orthodox" ? J.R : J.L;

  let leadFootAngle = 160;
  let rearFootAngle = 140;

  if (hasLandmark(lm, lead.k) && hasLandmark(lm, lead.a) && hasLandmark(lm, lead.f))
    leadFootAngle = angle(lm[lead.k], lm[lead.a], lm[lead.f]);

  if (hasLandmark(lm, rear.k) && hasLandmark(lm, rear.a) && hasLandmark(lm, rear.f))
    rearFootAngle = angle(lm[rear.k], lm[rear.a], lm[rear.f]);

  if (leadFootAngle < 140 || rearFootAngle < 110) {
    score -= 10;
    mistakeCounter.badFootAngle++;
    feedback.push("Angle your feet for rotation");
  }

  // Posture
  const spine = angle(lm[J.L.s], lm[J.L.h], lm[J.L.k]);
  if (spine < 165) {
    score -= 8;
    feedback.push("Stay upright — avoid leaning");
  }

  // Guard
  const handsUp =
    lm[J.L.w].y < lm[J.L.s].y + 0.08 &&
    lm[J.R.w].y < lm[J.R.s].y + 0.08;

  if (!handsUp && !isPunching) {
    score -= 12;
    feedback.push("Hands up — protect your head");
  }

  return {
    stance,
    score: clamp(Math.round(score), 0, 100),
    feedback,
  };
}

/*************************************************
 * GUARD DROP
 *************************************************/
function detectGuardDrop(lm, punchingSide) {
  const off = punchingSide === "left" ? J.R : J.L;
  if (lm[off.w].y > lm[off.s].y + 0.1) {
    mistakeCounter.guardDrop++;
    return "Guard dropped — keep your other hand up";
  }
  return null;
}

/*************************************************
 * DRAW HELPERS
 *************************************************/
function text(t, x, y, c = "white", s = 20) {
  ctx.fillStyle = c;
  ctx.font = `${s}px Arial`;
  ctx.fillText(t, x, y);
}

function drawGraph(data, x, y, w, h) {
  ctx.strokeStyle = "lime";
  ctx.beginPath();
  data.forEach((v, i) => {
    const px = x + (i / data.length) * w;
    const py = y + h - (v / 100) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/*************************************************
 * MAIN LOOP
 *************************************************/
function onResults(res) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!res.poseLandmarks) return;

  const lm = res.poseLandmarks;

  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: "#00ff00", lineWidth: 3 });
  drawLandmarks(ctx, lm, { color: "#ff0000", lineWidth: 2 });

  const punchingSide = lm[J.L.w].x < lm[J.R.w].x ? "left" : "right";
  const arm = punchingSide === "left" ? J.L : J.R;

  const isPunching = angle(lm[arm.s], lm[arm.e], lm[arm.w]) > 155;

  const stanceEval = analyzeStance(lm, isPunching);
  const guardMsg = isPunching ? detectGuardDrop(lm, punchingSide) : null;

  stanceHistory.push(stanceEval.score);
  if (stanceHistory.length > HISTORY_LIMIT) stanceHistory.shift();

  const topMistake = Object.entries(mistakeCounter)
    .sort((a, b) => b[1] - a[1])[0][0];

  // UI
  text(`STANCE: ${stanceEval.stance}`, 20, 30, "cyan", 26);
  text(`STANCE SCORE: ${stanceEval.score}`, 20, 65, "lime", 26);

  stanceEval.feedback.slice(0, 2).forEach((f, i) => {
    text(`• ${f}`, 20, 105 + i * 24, "orange", 20);
  });

  if (guardMsg) text(`⚠ ${guardMsg}`, 20, 165, "red", 22);

  text(`FOCUS: ${topMistake.replace(/([A-Z])/g, " $1")}`, 20, 200, "yellow", 20);

  drawGraph(stanceHistory, canvas.width - 260, 40, 240, 100);
  text("Stance Consistency", canvas.width - 260, 30, "white", 16);
}
