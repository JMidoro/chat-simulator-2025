declare module "react-speech-recognition" {
  export interface UseSpeechRecognitionResult {
    transcript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
  }

  export function useSpeechRecognition(): UseSpeechRecognitionResult;

  const SpeechRecognition: {
    startListening: (options?: { continuous?: boolean; language?: string }) => void;
    stopListening: () => void;
    abortListening?: () => void;
  };

  export default SpeechRecognition;
}
