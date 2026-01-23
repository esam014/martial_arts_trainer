export class VideoController {
  constructor(videoId) {
    this.video = document.getElementById(videoId);
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.video.srcObject = stream;
  }
}
