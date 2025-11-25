
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Users, ChevronDown, Activity, UserPlus, Link, Settings2 } from 'lucide-react';
import { ConnectionState, AudioPeer } from '../types';

interface DynamicIslandProps {
  connectionState: ConnectionState;
  peers: AudioPeer[];
  userVolume: number; // 0 to 1
  aiVolume: number;   // 0 to 1
  aiTranscription?: string;
  isDarkMode: boolean; // Received from parent
  onToggleMute: () => void;
  onDisconnect: () => void;
  onConnect: () => void;
  onAddUser: () => void;
  onConfigureAI?: () => void;
}

const getStateConfig = (state: ConnectionState) => {
  switch (state) {
    case ConnectionState.CONNECTED:
      return { color: 'bg-green-500', text: 'Live' };
    case ConnectionState.CONNECTING:
      return { color: 'bg-yellow-500', text: 'Connecting' };
    case ConnectionState.ERROR:
      return { color: 'bg-red-500', text: 'Error' };
    case ConnectionState.DISCONNECTED:
    default:
      return { color: 'bg-gray-500', text: 'Start Session' };
  }
};

// Simple waveform component
const Waveform = ({ volume, color }: { volume: number, color: string }) => {
    // Generate 5 bars
    const bars = [0.4, 0.7, 1.0, 0.7, 0.4]; 
    return (
        <div className="flex items-center gap-[2px] h-4">
            {bars.map((scale, i) => {
                // Determine height based on volume
                const height = Math.max(3, volume * 20 * scale);
                return (
                    <div 
                        key={i} 
                        className={`w-1 rounded-full ${color} transition-all duration-75`} 
                        style={{ height: `${height}px` }}
                    ></div>
                );
            })}
        </div>
    );
};

const DynamicIsland: React.FC<DynamicIslandProps> = ({
  connectionState,
  peers,
  userVolume,
  aiVolume,
  aiTranscription,
  isDarkMode,
  onToggleMute,
  onDisconnect,
  onConnect,
  onAddUser,
  onConfigureAI
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;
  
  const stateConfig = getStateConfig(connectionState);

  // Auto-collapse after delay if mouse leaves
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDisconnect = () => {
    onDisconnect();
    setIsExpanded(false);
  };

  const getContainerClasses = () => {
    const baseClasses = isDarkMode 
        ? "bg-black text-white shadow-2xl overflow-hidden" 
        : "bg-white text-gray-900 shadow-xl border border-gray-200 overflow-hidden";
    
    if (isExpanded) {
      return `${baseClasses} w-[400px] rounded-[32px] p-6`;
    }
    return `${baseClasses} w-[200px] h-[48px] rounded-full flex items-center justify-between px-2`;
  };

  const aiPeer = peers.find(p => p.type === 'ai');

  return (
    <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 flex justify-center">
      <div
        ref={containerRef}
        className={getContainerClasses()}
        style={{ height: isExpanded ? 'auto' : '48px' }}
      >
        {!isExpanded ? (
          // COLLAPSED STATE
          <div 
            className="flex items-center justify-between w-full h-full cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            <div className="flex-1 flex items-center gap-3 pl-2 overflow-hidden">
              <div className="relative shrink-0 w-8 flex justify-center">
                 {isConnected ? (
                   aiPeer?.isSpeaking 
                    ? <Waveform volume={aiVolume} color="bg-indigo-500" />
                    : <div className="w-1 h-1 rounded-full bg-green-500"></div>
                 ) : (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
                        <MicOff size={12} className="text-gray-400" />
                    </div>
                 )}
              </div>
              
              <div className="flex items-center gap-2">
                 {/* Status Dot */}
                 <div className={`w-2 h-2 rounded-full ${stateConfig.color} ${isConnecting ? 'animate-pulse' : ''}`} />
                 <span className={`text-sm font-medium tracking-tight truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    {stateConfig.text}
                 </span>
              </div>
            </div>
            
            <div className="pr-2 shrink-0">
               {isConnected ? (
                   <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                       <Activity size={14} className="text-green-400 animate-pulse" />
                   </div>
               ) : (
                   <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
                       Go
                   </div>
               )}
            </div>
          </div>
        ) : (
          // EXPANDED STATE
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3" onClick={() => setIsExpanded(false)}>
                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Activity className="text-white" size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg leading-tight">Forex Analysis</h3>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stateConfig.color} ${isConnecting ? 'animate-pulse' : ''}`} />
                        <p className="text-xs text-gray-400">{stateConfig.text} • {peers.length} Members</p>
                    </div>
                 </div>
              </div>
              <button 
                onClick={() => setIsExpanded(false)}
                className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <ChevronDown size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Avatar Grid */}
            <div className="flex justify-center gap-4 py-2 flex-wrap">
               {peers.map((peer) => {
                  const isTalking = peer.type === 'human' ? userVolume > 0.1 : aiVolume > 0.1;
                  const ringColor = isTalking ? 'ring-green-500 ring-offset-black' : 'ring-transparent';
                  
                  return (
                    <div 
                        key={peer.id} 
                        className={`flex flex-col items-center gap-2 relative group ${peer.type === 'ai' && !isConnected ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                            if (peer.type === 'ai' && !isConnected && onConfigureAI) {
                                onConfigureAI();
                            }
                        }}
                    >
                        <div className={`relative w-16 h-16 rounded-full ring-2 ring-offset-2 transition-all duration-200 ${ringColor}`}>
                            <img 
                                src={peer.avatar} 
                                alt={peer.name} 
                                className={`w-full h-full rounded-full object-cover ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} ${peer.type === 'ai' && !isConnected ? 'group-hover:opacity-80' : ''}`}
                            />
                            {peer.isMuted && (
                                <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center border border-gray-700 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                                    <MicOff size={12} className="text-red-400" />
                                </div>
                            )}
                            
                            {/* Visual Waveform for Speaker */}
                            {peer.type === 'ai' && isTalking && (
                                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5 h-3 items-end">
                                    <div className="w-1 bg-indigo-500 rounded-full animate-[bounce_0.5s_infinite]" style={{ height: '8px' }}></div>
                                    <div className="w-1 bg-indigo-500 rounded-full animate-[bounce_0.6s_infinite]" style={{ height: '12px' }}></div>
                                    <div className="w-1 bg-indigo-500 rounded-full animate-[bounce_0.5s_infinite]" style={{ height: '8px' }}></div>
                                </div>
                            )}
                            
                            {peer.type === 'ai' && !isConnected && (
                                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Settings2 size={20} className="text-white" />
                                </div>
                            )}
                        </div>
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{peer.name}</span>
                    </div>
                  )
               })}
               
               <button onClick={onAddUser} className="flex flex-col items-center gap-2 group">
                   <div className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${isDarkMode ? 'border-gray-700 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`}>
                       <UserPlus size={24} className="text-gray-500 group-hover:text-gray-400" />
                   </div>
                   <span className="text-xs font-medium text-gray-500">Invite</span>
               </button>
            </div>

            {/* Live Transcript Bubble */}
            {isConnected && aiTranscription && (
              <div className={`${isDarkMode ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-100 border-gray-200'} backdrop-blur rounded-2xl p-4 border`}>
                <p className={`text-sm leading-relaxed text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  "{aiTranscription}"
                </p>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mt-2">
              {!isConnected ? (
                  <button 
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-500 text-white rounded-full font-semibold text-sm disabled:opacity-50 shadow-md"
                  >
                    {isConnecting ? 'Connecting...' : 'Start Space'}
                  </button>
              ) : (
                <>
                  <button 
                    onClick={onToggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center shadow-sm border ${
                        peers.find(p => p.type === 'human')?.isMuted 
                        ? (isDarkMode ? 'bg-white text-black' : 'bg-gray-900 text-white')
                        : (isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700 border-gray-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200 border-gray-200')
                    }`}
                  >
                    {peers.find(p => p.type === 'human')?.isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  
                  <button 
                    onClick={handleDisconnect}
                    className="w-14 h-14 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center shadow-sm border border-transparent"
                  >
                    <PhoneOff size={24} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicIsland;
