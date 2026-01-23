export class VideoController {
    constructor(videoId, canvasId) {
        this.video = document.getElementById(videoId);
        this.canvas = document.getElementById(canvasId);
    }

    async start() {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });

        this.video.srcObject = stream;

        return new Promise(resolve => {
            this.video.onloadedmetadata = () => {
                this.video.play();

                // Match canvas resolution to actual video stream
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;

                resolve();
            };
        });
    }
}
