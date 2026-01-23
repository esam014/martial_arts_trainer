import { VideoController } from './video/VideoController.js';
import { PoseEstimator } from './pose/PoseEstimator.js';
import { Joint3DMapper } from './pose/Joint3DMapper.js';
import { MovementAnalyzer } from './analysis/MovementAnalyzer.js';
import { VoiceCoach } from './coaching/VoiceCoach.js';
import { SkeletonSimulator } from './simulation/SkeletonSimulator.js';

class BoxingCoachApp {
    constructor() {
        this.video = new VideoController('video');
        this.pose = new PoseEstimator('video', 'overlay');
        this.mapper = new Joint3DMapper();
        this.analyzer = new MovementAnalyzer();
        this.voice = new VoiceCoach();
        this.simulator = new SkeletonSimulator('overlay');

        this.currentFrames = [];
    }

    async startSession(punchType) {
        await this.video.start();
        this.pose.start((landmarks) => this.onPoseFrame(landmarks));

        this.voice.startCoaching(() => {
            this.currentFrames = [];
            setTimeout(() => this.finishCapture(punchType), 5000);
        });
    }

    onPoseFrame(landmarks) {
        const joints3D = this.mapper.mapTo3D(landmarks);
        this.currentFrames.push(joints3D);
    }

    finishCapture(punchType) {
        const feedback = this.analyzer.analyze(this.currentFrames, punchType);
        this.voice.speak(feedback);
    }

    startSimulation() {
        this.simulator.play();
    }
}

window.app = new BoxingCoachApp();
