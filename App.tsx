
import React, { useState, useEffect, useRef } from 'react';
import AnnotationCanvas, { AnnotationCanvasRef } from './components/AnnotationCanvas';
import DynamicIsland from './components/DynamicIsland';
import GeminiConfigModal, { GeminiConfig } from './components/GeminiConfigModal';
import { GeminiLiveService } from './services/geminiLiveService';
import { ConnectionState, AudioPeer, DrawingElement } from './types';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [aiTranscription, setAiTranscription] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false); 
  
  // Configuration State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [geminiConfig, setGeminiConfig] = useState<GeminiConfig>({
    name: 'Gemini Live',
    voiceName: 'Kore',
    systemInstruction: `You are a smart AI Co-Host for a 'JournalFX' Mentor Session. You are an expert financial analyst.

Your goal is to provide concise, technical observations about the user's drawings on the chart. 
- Focus on price action structure (HH, HL).
- Identify potential liquidity zones.
- Keep responses brief and conversational.`,
    isEnabled: true
  });

  const [peers, setPeers] = useState<AudioPeer[]>([
    {
        id: 'user-1',
        name: 'You',
        avatar: 'https://picsum.photos/100/100', // Placeholder
        isSpeaking: false,
        isMuted: false,
        type: 'human'
    },
    {
        id: 'gemini-ai',
        name: 'Gemini Live',
        avatar: 'https://picsum.photos/101/101', // Different placeholder
        isSpeaking: false,
        isMuted: false,
        type: 'ai'
    }
  ]);

  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const canvasRef = useRef<AnnotationCanvasRef | null>(null);
  const canvasHtmlRef = useRef<HTMLCanvasElement | null>(null); // For image streaming
  
  const isAiSpeakingRef = useRef(false);
  const aiSpeakingTimeoutRef = useRef<number | null>(null);

  // Initialize Service
  useEffect(() => {
    const apiKey = process.env.API_KEY || ''; 
    
    if (!apiKey) {
      console.error("No API Key found");
      return;
    }

    geminiServiceRef.current = new GeminiLiveService({
      apiKey,
      onConnectionStateChange: (state) => setConnectionState(state),
      onAudioData: (buffer) => {
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 10) {
            sum += Math.abs(data[i]);
        }
        const avg = sum / (data.length / 10);
        const volume = Math.min(1, avg * 5); 
        setAiVolume(volume);

        isAiSpeakingRef.current = true;
        if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);

        aiSpeakingTimeoutRef.current = window.setTimeout(() => {
            setAiTranscription(''); 
            setAiVolume(0);
            isAiSpeakingRef.current = false;
            setPeers(prev => prev.map(p => 
                p.type === 'ai' ? { ...p, isSpeaking: false } : p
            ));
        }, 3000);

        setPeers(prev => prev.map(p => 
            p.type === 'ai' ? { ...p, isSpeaking: volume > 0.05 } : p
        ));
      },
      onTranscription: (text, isModel) => {
          if (isModel) {
              if (text === null) {
                  setAiTranscription('');
                  if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
                  isAiSpeakingRef.current = false;
              } else {
                  setAiTranscription(prev => prev + text);
              }
          }
      },
      onVolumeChange: (vol) => {
          setUserVolume(vol);
          setPeers(prev => prev.map(p => 
            p.type === 'human' ? { ...p, isSpeaking: vol > 0.05 } : p
          ));

          const interruptionThreshold = isAiSpeakingRef.current ? 0.5 : 0.15;

          if (vol > interruptionThreshold) {
              setAiTranscription('');
              if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
              isAiSpeakingRef.current = false;
          }
      },
      // Handle Tool Calls from Gemini
      onToolCall: async (name, args) => {
          console.log(`Executing tool: ${name}`, args);
          if (!canvasRef.current) return;
          
          if (name === 'draw_level') {
              const element: DrawingElement = {
                  id: Date.now().toString(),
                  type: 'line',
                  x: 0, 
                  y: args.y,
                  width: window.innerWidth, // Full width line
                  height: 0,
                  strokeColor: args.color || '#ff0000',
                  strokeWidth: 2,
                  strokeStyle: 'dashed',
                  backgroundColor: 'transparent',
                  text: args.label
              };
              canvasRef.current.addExternalElement(element);
          } else if (name === 'draw_zone') {
              const element: DrawingElement = {
                  id: Date.now().toString(),
                  type: 'rectangle',
                  x: args.x, 
                  y: args.y,
                  width: args.width,
                  height: args.height,
                  strokeColor: 'transparent',
                  backgroundColor: args.color || 'rgba(0, 255, 0, 0.2)',
                  strokeWidth: 0,
                  opacity: 50
              };
              canvasRef.current.addExternalElement(element);
          }
      }
    });

    return () => {
      geminiServiceRef.current?.disconnect();
      if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
    };
  }, []);

  // Sync mute state
  useEffect(() => {
    if (geminiServiceRef.current) {
        geminiServiceRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  // Periodic visual updates
  useEffect(() => {
    if (connectionState !== ConnectionState.CONNECTED) return;
    const interval = setInterval(() => {
      // Use the helper to get the raw canvas DOM node
      const canvas = canvasRef.current?.getCanvas();
      if (canvas && geminiServiceRef.current) {
        geminiServiceRef.current.sendVisualFrame(canvas);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState]);

  useEffect(() => {
    setPeers(prev => prev.map(p => p.type === 'ai' ? { ...p, name: geminiConfig.name } : p));
  }, [geminiConfig.name]);

  const handleConnect = () => {
    if (geminiConfig.isEnabled) {
      geminiServiceRef.current?.connect({
        voiceName: geminiConfig.voiceName,
        systemInstruction: geminiConfig.systemInstruction
      });
    } else {
       alert("Please enable Gemini Co-Host in settings to start.");
    }
  };

  const handleDisconnect = () => {
    geminiServiceRef.current?.disconnect();
    setAiTranscription('');
    if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
    isAiSpeakingRef.current = false;
  };

  const handleToggleMute = () => {
    setIsMuted(prev => !prev);
    setPeers(prev => prev.map(p => p.type === 'human' ? { ...p, isMuted: !p.isMuted } : p));
  };
  
  const handleAddUser = () => {
      const newId = `user-${Date.now()}`;
      setPeers(prev => [...prev, {
          id: newId,
          name: `Trader ${prev.length}`,
          avatar: `https://picsum.photos/100/100?random=${newId}`,
          isSpeaking: false,
          isMuted: true,
          type: 'human'
      }]);
  };

  const handleToggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <AnnotationCanvas 
        ref={canvasRef}
        onCanvasRef={(ref) => canvasHtmlRef.current = ref} 
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
      />

      <DynamicIsland 
        connectionState={connectionState}
        peers={peers}
        userVolume={userVolume}
        aiVolume={aiVolume}
        aiTranscription={aiTranscription}
        isDarkMode={isDarkMode}
        onToggleMute={handleToggleMute}
        onDisconnect={handleDisconnect}
        onConnect={handleConnect}
        onAddUser={handleAddUser}
        onConfigureAI={() => setIsConfigModalOpen(true)}
      />

      <GeminiConfigModal 
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={geminiConfig}
        onConfigChange={setGeminiConfig}
      />
    </div>
  );
};

export default App;
