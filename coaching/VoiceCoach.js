export class VoiceCoach {
    startCoaching(onCommand) {
        setInterval(() => {
            this.speak("Execute the punch");
            onCommand();
        }, 10000);
    }

    speak(text) {
        speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
}
