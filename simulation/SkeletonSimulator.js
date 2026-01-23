import samplePunch from '../data/samplePunch.js';

export class SkeletonSimulator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
    }

    play() {
        let frame = 0;

        const animate = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            samplePunch[frame]?.forEach(j => {
                this.ctx.beginPath();
                this.ctx.arc(j.x * 400, j.y * 400, 5, 0, Math.PI * 2);
                this.ctx.fill();
            });

            frame = (frame + 1) % samplePunch.length;
            requestAnimationFrame(animate);
        };

        animate();
    }
}
