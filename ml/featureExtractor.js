/*************************************************
 * ML Feature Extractor
 * Jab v1
 *************************************************/

export function extractJabFeatures({
    landmarks,
    stance,
    phase,
    phaseTime,
    prevFrame
}) {
    const lm = landmarks;

    const L = stance === "Orthodox"
        ? { s: 11, e: 13, w: 15 }
        : { s: 12, e: 14, w: 16 };

    const R = stance === "Orthodox"
        ? { w: 16 }
        : { w: 15 };

    // --- Helpers ---
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const angle = (a, b, c) => {
        const ab = { x: a.x - b.x, y: a.y - b.y };
        const cb = { x: c.x - b.x, y: c.y - b.y };
        const dot = ab.x * cb.x + ab.y * cb.y;
        const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
        return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
    };

    // --- Body scale ---
    const shoulderWidth = dist(lm[11], lm[12]) || 1;

    // --- Arm kinematics ---
    const elbowAngle = angle(lm[L.s], lm[L.e], lm[L.w]);
    const elbowVel = prevFrame ? elbowAngle - prevFrame.elbowAngle : 0;
    const elbowAcc = prevFrame ? elbowVel - prevFrame.elbowVel : 0;

    const wristVel = prevFrame
        ? dist(lm[L.w], prevFrame.wrist) / shoulderWidth
        : 0;

    const wristAcc = prevFrame ? wristVel - prevFrame.wristVel : 0;

    // --- Shoulder / torso ---
    const shoulderRot = Math.abs(lm[11].x - lm[12].x);
    const shoulderVel = prevFrame
        ? shoulderRot - prevFrame.shoulderRot
        : 0;

    const hipRot = Math.abs(lm[23].x - lm[24].x);
    const hipVel = prevFrame ? hipRot - prevFrame.hipRot : 0;

    // --- Guard & balance ---
    const head = lm[0];
    const rearHand = lm[R.w];

    const guardHeight =
        (head.y - rearHand.y) / (head.y - lm[23].y);

    const headDisp = Math.abs(
        head.x - (lm[23].x + lm[24].x) / 2
    );

    const headVel = prevFrame ? headDisp - prevFrame.headDisp : 0;

    // --- Phase encoding ---
    const phaseOneHot = [
        phase === "IDLE" ? 1 : 0,
        phase === "EXTENDING" ? 1 : 0,
        phase === "FULL" ? 1 : 0,
        phase === "RETRACTING" ? 1 : 0
    ];

    // --- Output feature vector ---
    return {
        vector: [
            elbowAngle,
            elbowVel,
            elbowAcc,
            wristVel,
            wristAcc,

            shoulderRot,
            shoulderVel,
            hipRot,
            hipVel,

            guardHeight,
            headDisp,
            headVel,

            ...phaseOneHot,
            phaseTime
        ],

        debug: {
            elbowAngle,
            wristVel,
            guardHeight,
            shoulderRot,
            hipRot,
            headDisp
        }
    };
}
