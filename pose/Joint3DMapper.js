export class Joint3DMapper {
    mapTo3D(landmarks) {
        log(landmarks.map(joint => ({
            x: joint.x,
            y: joint.y,
            z: joint.z
        })));
        return landmarks.map(joint => ({
            x: joint.x,
            y: joint.y,
            z: joint.z // MediaPipe gives relative depth
        }));
    }
}
