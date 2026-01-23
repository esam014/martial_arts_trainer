export class MovementAnalyzer {
    analyze(frames, punchType) {
        if (frames.length < 10) return "Try a stronger punch.";

        // Example: elbow extension velocity
        const start = frames[0];
        const end = frames[frames.length - 1];

        const velocity =
            Math.abs(end[14].x - start[14].x); // right elbow

        if (velocity < 0.05)
            return `Extend your arm more on the ${punchType}.`;

        return `Good ${punchType}! Focus on rotating your hips.`;
    }
}
