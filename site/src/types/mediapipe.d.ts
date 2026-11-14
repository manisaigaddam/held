declare module "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm" {
  export const FilesetResolver: {
    forVisionTasks(path: string): Promise<unknown>;
  };
  export const GestureRecognizer: {
    createFromOptions(files: unknown, options: object): Promise<{
      recognizeForVideo(video: HTMLVideoElement, timestamp: number): {
        gestures?: { categoryName?: string }[][];
        landmarks?: { x: number; y: number }[][];
      };
      close(): void;
    }>;
  };
}
