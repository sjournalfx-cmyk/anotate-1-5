
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { ConnectionState } from '../types';
import { base64ToUint8Array, decodeAudioData, createPcmBlob, downsampleTo16k } from './audioUtils';

interface GeminiLiveConfig {
  apiKey: string;
  onConnectionStateChange: (state: ConnectionState) => void;
  onAudioData: (audioBuffer: AudioBuffer) => void;
  onTranscription: (text: string | null, isModel: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onToolCall?: (functionName: string, args: any) => Promise<any>;
}

export interface ConnectConfig {
  voiceName: string;
  systemInstruction: string;
}

// Define the tools available to the AI
const tools: FunctionDeclaration[] = [
  {
    name: 'draw_level',
    description: 'Draws a horizontal support or resistance line at a specific price level (Y-coordinate).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        y: { type: Type.NUMBER, description: 'The Y coordinate on the canvas to draw the line.' },
        color: { type: Type.STRING, description: 'Color of the line (e.g., #FF0000 for resistance, #00FF00 for support).' },
        label: { type: Type.STRING, description: 'Text label for the level (e.g., "Daily Resistance").' }
      },
      required: ['y', 'color']
    }
  },
  {
    name: 'draw_zone',
    description: 'Draws a rectangular highlight zone to mark consolidation or supply/demand areas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'Top-left X coordinate.' },
        y: { type: Type.NUMBER, description: 'Top-left Y coordinate.' },
        width: { type: Type.NUMBER, description: 'Width of the zone.' },
        height: { type: Type.NUMBER, description: 'Height of the zone.' },
        color: { type: Type.STRING, description: 'Color of the zone.' }
      },
      required: ['x', 'y', 'width', 'height']
    }
  }
];

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputScriptProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime = 0;
  private config: GeminiLiveConfig;
  private videoInterval: number | null = null;
  private gainNode: GainNode | null = null;
  private isMuted: boolean = false;
  private audioSources: Set<AudioBufferSourceNode> = new Set();

  constructor(config: GeminiLiveConfig) {
    this.config = config;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  async connect(connectConfig?: ConnectConfig) {
    try {
      this.config.onConnectionStateChange(ConnectionState.CONNECTING);

      // Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Critical: Resume contexts here to satisfy browser autoplay policies (initiated by user click)
      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const voiceName = connectConfig?.voiceName || 'Kore';
      const baseInstruction = connectConfig?.systemInstruction || `You are an expert Forex trading analyst.`;
      const systemInstruction = `${baseInstruction}
      
      IMPORTANT: You have the ability to draw on the user's whiteboard using the 'draw_level' and 'draw_zone' tools. 
      If you see a key level or pattern in the visual input, ASK permission to draw it, then use the tool.
      The visual input coordinate system corresponds roughly to the tool coordinates. Use your best judgement based on the visual feed.`;

      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Session Opened');
            this.config.onConnectionStateChange(ConnectionState.CONNECTED);
            this.startAudioInputStream(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
             this.handleServerMessage(message);
          },
          onclose: () => {
            console.log('Gemini Live Session Closed');
            this.config.onConnectionStateChange(ConnectionState.DISCONNECTED);
            this.cleanup();
          },
          onerror: (err) => {
            console.error('Gemini Live Session Error', err);
            this.config.onConnectionStateChange(ConnectionState.ERROR);
            this.cleanup();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {}, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: tools }]
        },
      });

      this.sessionPromise = sessionPromise;
      await sessionPromise;

    } catch (error) {
      console.error('Failed to connect to Gemini Live:', error);
      this.config.onConnectionStateChange(ConnectionState.ERROR);
      this.cleanup();
    }
  }

  private startAudioInputStream(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.mediaStream) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.inputScriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.inputScriptProcessor.onaudioprocess = (e) => {
      if (!this.inputAudioContext) return;
      
      const inputBuffer = e.inputBuffer.getChannelData(0);
      
      // Calculate Volume
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      this.config.onVolumeChange(this.isMuted ? 0 : rms * 50);

      if (this.isMuted) return;

      // Prepare data for Gemini
      const resampledData = downsampleTo16k(inputBuffer, this.inputAudioContext.sampleRate);
      const pcmBlob = createPcmBlob(resampledData);
      
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    source.connect(this.inputScriptProcessor);
    
    // Connect to destination to keep processor alive (muted)
    this.gainNode = this.inputAudioContext.createGain();
    this.gainNode.gain.value = 0;
    this.inputScriptProcessor.connect(this.gainNode);
    this.gainNode.connect(this.inputAudioContext.destination);
  }

  public sendVisualFrame(canvas: HTMLCanvasElement) {
    if (!this.sessionPromise) return;
    
    canvas.toBlob(async (blob) => {
      if (blob) {
         const reader = new FileReader();
         reader.onloadend = () => {
             const base64data = (reader.result as string).split(',')[1];
             this.sessionPromise?.then(session => {
                 session.sendRealtimeInput({
                     media: {
                         mimeType: 'image/jpeg',
                         data: base64data
                     }
                 });
             });
         };
         reader.readAsDataURL(blob);
      }
    }, 'image/jpeg', 0.6);
  }

  private async handleServerMessage(message: LiveServerMessage) {
    // Handle Audio
    const audioStr = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioStr && this.outputAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      const audioBytes = base64ToUint8Array(audioStr);
      const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext);
      
      this.config.onAudioData(audioBuffer); 

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      source.onended = () => {
          this.audioSources.delete(source);
      };
      
      source.start(this.nextStartTime);
      this.audioSources.add(source);
      this.nextStartTime += audioBuffer.duration;
    }

    // Handle Function Calls
    if (message.toolCall) {
        console.log('Gemini Tool Call:', message.toolCall);
        const functionCalls = message.toolCall.functionCalls;
        
        for (const call of functionCalls) {
            let result: any = { status: 'ok' };
            if (this.config.onToolCall) {
                try {
                    await this.config.onToolCall(call.name, call.args);
                } catch (e: any) {
                    result = { status: 'error', message: e.toString() };
                }
            }
            
            // Send response back
            this.sessionPromise?.then(session => {
                session.sendToolResponse({
                    functionResponses: [{
                        id: call.id,
                        name: call.name,
                        response: { result }
                    }]
                });
            });
        }
    }

    if (message.serverContent?.outputTranscription?.text) {
        this.config.onTranscription(message.serverContent.outputTranscription.text, true);
    }

    if (message.serverContent?.interrupted) {
      console.log('Model interrupted');
      this.audioSources.forEach(source => {
          try {
              source.stop();
          } catch(e) {
              // Ignore errors if source already stopped
          }
      });
      this.audioSources.clear();
      if (this.outputAudioContext) {
          this.nextStartTime = this.outputAudioContext.currentTime;
      }
      this.config.onTranscription(null, true);
    }
  }

  async disconnect() {
    if (this.sessionPromise) {
        try {
            const session = await this.sessionPromise;
            session.close();
        } catch (e) {
            console.log("Session already closed or failed", e);
        }
    }
    this.cleanup();
    this.config.onConnectionStateChange(ConnectionState.DISCONNECTED);
  }

  private cleanup() {
    if (this.inputScriptProcessor) {
      this.inputScriptProcessor.disconnect();
      this.inputScriptProcessor = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.audioSources.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    this.audioSources.clear();

    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    if (this.videoInterval) {
        window.clearInterval(this.videoInterval);
        this.videoInterval = null;
    }
    this.sessionPromise = null;
  }
}
