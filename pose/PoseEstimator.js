const POSE_CONNECTIONS = [
    [11, 13], [13, 15], // Left arm
    [12, 14], [14, 16], // Right arm
    [11, 12],           // Shoulders
    [23, 24],           // Hips
    [11, 23], [12, 24], // Torso
    [23, 25], [25, 27], // Left leg
    [24, 26], [26, 28]  // Right leg
];

export class PoseEstimator {
    constructor(videoId, canvasId) {
        this.video = document.getElementById(videoId);
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");

        this.pose = new Pose({
            locateFile: file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
    }

    start(onFrame) {
        this.pose.onResults(results => {
            if (!results.poseLandmarks) return;

            this.drawSkeleton(results.poseLandmarks);
            onFrame(results.poseLandmarks);
        });

        this.camera = new Camera(this.video, {
            onFrame: async () => {
                await this.pose.send({ image: this.video });
            },
            width: this.canvas.width,
            height: this.canvas.height
        });

        this.camera.start();
    }

    drawSkeleton(landmarks) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        // Draw bones
        this.ctx.strokeStyle = "#00ffcc";
        this.ctx.lineWidth = 3;

        POSE_CONNECTIONS.forEach(([a, b]) => {
            const p1 = landmarks[a];
            const p2 = landmarks[b];

            this.ctx.beginPath();
            this.ctx.moveTo(p1.x * w, p1.y * h);
            this.ctx.lineTo(p2.x * w, p2.y * h);
            this.ctx.stroke();
        });

        // Draw joints
        this.ctx.fillStyle = "#ffffff";

        landmarks.forEach(j => {
            this.ctx.beginPath();
            this.ctx.arc(j.x * w, j.y * h, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}
