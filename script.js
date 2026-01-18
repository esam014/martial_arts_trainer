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

  const angleRad = Math.acos(dot / (magAB * magCB));
  return angleRad * (180 / Math.PI);
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
 * STEP 4: TECHNIQUE STATE MACHINE
 *************************************************/
let techniqueState = "idle"; // idle → executing → cooldown
let peakScore = 0;
let lastRepScore = null;
let cooldownCounter = 0;

const MOVEMENT = {
  startElbowAngle: 120,
  peakElbowAngle: 165,
  cooldownFrames: 15,
};

/*************************************************
 * DRAWING HELPERS
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

  // Draw skeleton
  drawConnectors(ctx, lm, POSE_CONNECTIONS, {
    color: "#00FF00",
    lineWidth: 3,
  });
  drawLandmarks(ctx, lm, { color: "#FF0000", lineWidth: 2 });

  // Determine active side (front arm)
  const activeSide =
    lm[JOINTS.left.wrist].x < lm[JOINTS.right.wrist].x
      ? "left"
      : "right";

  const J = JOINTS[activeSide];

  // Calculate angles
  const angles = {
    elbow: calculateAngle(lm[J.shoulder], lm[J.elbow], lm[J.wrist]),
    shoulder: calculateAngle(lm[J.elbow], lm[J.shoulder], lm[J.hip]),
    hip: calculateAngle(lm[J.shoulder], lm[J.hip], lm[J.knee]),
    knee: calculateAngle(lm[J.hip], lm[J.knee], lm[J.ankle]),
  };

  // Live score
  const liveScore = scoreTechnique(angles);

  /*************************************************
   * STATE MACHINE LOGIC
   *************************************************/
  if (techniqueState === "idle") {
    if (angles.elbow < MOVEMENT.startElbowAngle) {
      techniqueState = "executing";
      peakScore = 0;
    }
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

  /*************************************************
   * UI OVERLAY
   *************************************************/
  drawText(`Side: ${activeSide}`, 20, 30);
  drawText(`State: ${techniqueState}`, 20, 60);
  drawText(`Live Score: ${liveScore}`, 20, 90);

  if (lastRepScore !== null) {
    drawText(
      `Last Rep: ${lastRepScore}`,
      20,
      130,
      lastRepScore > 80 ? "lime" : "orange",
      28
    );
  }

  // Draw joint angles near joints
  drawText(
    `${angles.elbow.toFixed(0)}°`,
    lm[J.elbow].x * canvas.width,
    lm[J.elbow].y * canvas.height
  );

  drawText(
    `${angles.knee.toFixed(0)}°`,
    lm[J.knee].x * canvas.width,
    lm[J.knee].y * canvas.height
  );
}
