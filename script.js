/*************************************************
 * DOM SETUP
 *************************************************/
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

/*************************************************
 * MEDIAPIPE POSE SETUP
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
 * CAMERA
 *************************************************/
const camera = new Camera(video, {
  onFrame: async () => {
    await pose.send({ image: video });
  },
  width: 1280,
  height: 720,
});

camera.start();

/*************************************************
 * LANDMARK INDICES
 *************************************************/
const JOINTS = {
  left: {
    shoulder: 11,
    elbow: 13,
    wrist: 15,
    hip: 23,
    knee: 25,
    ankle: 27,
  },
  right: {
    shoulder: 12,
    elbow: 14,
    wrist: 16,
    hip: 24,
    knee: 26,
    ankle: 28,
  },
};

/*************************************************
 * ANGLE MATH
 *************************************************/
function calculateAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);

  return Math.acos(dot / (magAB * magCB)) * (180 / Math.PI);
}

/*************************************************
 * TECHNIQUE DEFINITION (STRAIGHT PUNCH)
 *************************************************/
const technique = {
  elbow: { min: 160, max: 180, weight: 0.4 },
  shoulder: { min: 40, max: 75, weight: 0.2 },
  hip: { min: 20, max: 45, weight: 0.25 },
  knee: { min: 150, max: 180, weight: 0.15 },
};

/*************************************************
 * SCORING
 *************************************************/
function scoreAngle(angle, min, max) {
  if (angle >= min && angle <= max) return 1;
  const distance = angle < min ? min - angle : angle - max;
  return Math.max(0, 1 - distance / 45);
}

function scoreTechnique(angles) {
  let total = 0;
  for (const joint in technique) {
    const { min, max, weight } = technique[joint];
    total += scoreAngle(angles[joint], min, max) * weight;
  }
  return Math.round(total * 100);
}

/*************************************************
 * BOXING STANCE DETECTION
 *************************************************/
function isInBoxingStance(lm) {
  const L = JOINTS.left;
  const R = JOINTS.right;

  // Hands up
  const handsUp =
    lm[L.wrist].y < lm[L.shoulder].y + 0.05 &&
    lm[R.wrist].y < lm[R.shoulder].y + 0.05;

  // Elbows bent
  const leftElbow = calculateAngle(lm[L.shoulder], lm[L.elbow], lm[L.wrist]);
  const rightElbow = calculateAngle(lm[R.shoulder], lm[R.elbow], lm[R.wrist]);
  const elbowsBent = leftElbow < 130 && rightElbow < 130;

  // Feet apart
  const ankleDist = Math.abs(lm[L.ankle].x - lm[R.ankle].x);
  const hipDist = Math.abs(lm[L.hip].x - lm[R.hip].x);
  const feetApart = ankleDist > hipDist * 0.9;

  // Upright torso
  const torsoAngle = calculateAngle(lm[L.shoulder], lm[L.hip], lm[L.knee]);
  const upright = torsoAngle > 160;

  return handsUp && elbowsBent && feetApart && upright;
}

/*************************************************
 * TECHNIQUE STATE MACHINE
 *************************************************/
let techniqueState = "notReady"; // notReady → idle → executing → cooldown
let peakScore = 0;
let lastRepScore = null;
let cooldownCounter = 0;

// stance forgiveness
let stanceGraceFrames = 0;
const STANCE_GRACE_LIMIT = 8;

const MOVEMENT = {
  startElbowAngle: 120,
  peakElbowAngle: 165,
  cooldownFrames: 15,
};

/*************************************************
 * DRAWING
 *************************************************/
function drawText(text, x, y, color = "yellow", size = 20) {
  ctx.fillStyle = color;
  ctx.font = `${size}px Arial`;
  ctx.fillText(text, x, y);
}

/*************************************************
 * MAIN LOOP
 *************************************************/
function onResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!results.poseLandmarks) return;

  const lm = results.poseLandmarks;

  drawConnectors(ctx, lm, POSE_CONNECTIONS, {
    color: "#00FF00",
    lineWidth: 3,
  });
  drawLandmarks(ctx, lm, { color: "#FF0000", lineWidth: 2 });

  /************ STANCE HANDLING ************/
  const inStance = isInBoxingStance(lm);

  if (!inStance) {
    stanceGraceFrames++;
  } else {
    stanceGraceFrames = 0;
  }

  if (stanceGraceFrames > STANCE_GRACE_LIMIT && techniqueState === "idle") {
    techniqueState = "notReady";
  }

  if (inStance && techniqueState === "notReady") {
    techniqueState = "idle";
  }

  /************ ACTIVE SIDE ************/
  const activeSide =
    lm[JOINTS.left.wrist].x < lm[JOINTS.right.wrist].x ? "left" : "right";
  const J = JOINTS[activeSide];

  /************ ANGLES ************/
  const angles = {
    elbow: calculateAngle(lm[J.shoulder], lm[J.elbow], lm[J.wrist]),
    shoulder: calculateAngle(lm[J.elbow], lm[J.shoulder], lm[J.hip]),
    hip: calculateAngle(lm[J.shoulder], lm[J.hip], lm[J.knee]),
    knee: calculateAngle(lm[J.hip], lm[J.knee], lm[J.ankle]),
  };

  const liveScore = scoreTechnique(angles);

  /************ EXECUTION LOGIC ************/
  if (techniqueState === "idle" && angles.elbow < MOVEMENT.startElbowAngle) {
    techniqueState = "executing";
    peakScore = 0;
  }

  if (techniqueState === "executing") {
    peakScore = Math.max(peakScore, liveScore);
    if (angles.elbow > MOVEMENT.peakElbowAngle) {
      techniqueState = "cooldown";
      lastRepScore = peakScore;
      cooldownCounter = 0;
    }
  }

  if (techniqueState === "cooldown") {
    cooldownCounter++;
    if (cooldownCounter > MOVEMENT.cooldownFrames) {
      techniqueState = "idle";
    }
  }

  /************ UI ************/
  drawText(
    `STANCE: ${inStance ? "READY" : "NOT READY"}`,
    20,
    30,
    inStance ? "lime" : "red",
    24
  );
  drawText(`STATE: ${techniqueState}`, 20, 60);
  drawText(`LIVE SCORE: ${liveScore}`, 20, 90);

  if (lastRepScore !== null) {
    drawText(
      `LAST REP: ${lastRepScore}`,
      20,
      130,
      lastRepScore > 80 ? "lime" : "orange",
      28
    );
  }

  // Joint labels
  drawText(
    `${angles.elbow.toFixed(0)}°`,
    lm[J.elbow].x * canvas.width,
    lm[J.elbow].y * canvas.height
  );
}
