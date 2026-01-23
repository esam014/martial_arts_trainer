export class PoseEstimator {
    constructor(videoId, canvasId) {
        this.video = document.getElementById(videoId);
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.pose = new Pose({
            locateFile: file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({ modelComplexity: 1 });
    }

    start(callback) {
        this.pose.onResults(results => {
            if (!results.poseLandmarks) return;

            this.drawSkeleton(results.poseLandmarks);
            callback(results.poseLandmarks);
        });

        const loop = async () => {
            await this.pose.send({ image: this.video });
            requestAnimationFrame(loop);
        };

        loop();
    }

    drawSkeleton(landmarks) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        landmarks.forEach(j => {
            this.ctx.beginPath();
            this.ctx.arc(j.x * this.canvas.width, j.y * this.canvas.height, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}
