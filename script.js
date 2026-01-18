const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

/* Initialize MediaPipe Pose */
const pose = new Pose({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

/* Handle Pose Results */
pose.onResults((results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  const lm = results.poseLandmarks;

  const leftElbowAngle = calculateAngle(
    lm[11], // shoulder
    lm[13], // elbow
    lm[15]  // wrist
  );

  const rightKneeAngle = calculateAngle(
    lm[24], // hip
    lm[26], // knee
    lm[28]  // ankle
  );

  console.log({
    leftElbowAngle: leftElbowAngle.toFixed(1),
    rightKneeAngle: rightKneeAngle.toFixed(1)
  });

  drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 3 });
  drawLandmarks(ctx, lm, { color: '#FF0000', lineWidth: 2 });

  drawAngleText(
  `${leftElbowAngle.toFixed(0)}°`,
  lm[13] // elbow
    );

    drawAngleText(
    `${rightKneeAngle.toFixed(0)}°`,
    lm[26] // knee
    );

    if (lm[13].visibility < 0.5) return;


});


/* Start Camera */
const camera = new Camera(video, {
  onFrame: async () => {
    await pose.send({ image: video });
  },
  width: 1280,
  height: 720,
});

camera.start();


function calculateAngle(a, b, c) {
  const ab = {
    x: a.x - b.x,
    y: a.y - b.y
  };

  const cb = {
    x: c.x - b.x,
    y: c.y - b.y
  };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);

  let angle = Math.acos(dot / (magAB * magCB));
  return angle * (180 / Math.PI);
}

function drawAngleText(text, landmark) {
  ctx.fillStyle = "yellow";
  ctx.font = "18px Arial";
  ctx.fillText(
    text,
    landmark.x * canvas.width,
    landmark.y * canvas.height
  );
}


