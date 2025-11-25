
import React from 'react';
import { X, Bot, Sparkles, PenTool } from 'lucide-react';

export interface GeminiConfig {
  name: string;
  voiceName: string;
  systemInstruction: string;
  isEnabled: boolean;
}

interface GeminiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GeminiConfig;
  onConfigChange: (config: GeminiConfig) => void;
}

const VOICES = [
  { id: 'Kore', label: 'Calm & Balanced', color: 'from-indigo-500 to-indigo-600' },
  { id: 'Puck', label: 'Energetic & Clear', color: 'from-blue-500 to-blue-600' },
  { id: 'Charon', label: 'Deep & Authoritative', color: 'from-slate-600 to-slate-700' },
  { id: 'Fenrir', label: 'Fast & Intense', color: 'from-red-500 to-red-600' },
  { id: 'Aoede', label: 'Soft & Friendly', color: 'from-emerald-500 to-emerald-600' }
];

const GeminiConfigModal: React.FC<GeminiConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange
}) => {
  if (!isOpen) return null;

  const handleChange = (key: keyof GeminiConfig, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        className="bg-[#0f111a] w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-[#161922]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg">
                <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Enable Gemini Co-Host</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">BETA</span>
                <span className="text-gray-400 text-xs">AI analyst to support your session</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
                onClick={() => handleChange('isEnabled', !config.isEnabled)}
                className={`w-12 h-7 rounded-full transition-colors relative ${config.isEnabled ? 'bg-indigo-500' : 'bg-gray-700'}`}
            >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${config.isEnabled ? 'left-6' : 'left-1'}`} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            
            {/* AI Name */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI Name</label>
                <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Bot size={18} />
                    </div>
                    <input 
                        type="text" 
                        value={config.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full bg-[#1e2330] border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="e.g. Trading Copilot"
                    />
                </div>
            </div>

            {/* Voice Selection */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select Voice Persona</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {VOICES.map((voice) => (
                        <button
                            key={voice.id}
                            onClick={() => handleChange('voiceName', voice.id)}
                            className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                config.voiceName === voice.id 
                                ? 'bg-[#1e2330] border-indigo-500 ring-1 ring-indigo-500/50' 
                                : 'bg-[#1e2330]/50 border-gray-800 hover:border-gray-600 hover:bg-[#1e2330]'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${voice.color} flex items-center justify-center shrink-0`}>
                                {/* Animated waveform placeholder */}
                                <div className="flex gap-0.5 items-center h-3">
                                    <div className="w-0.5 bg-white/80 h-full animate-[pulse_1s_ease-in-out_infinite]"></div>
                                    <div className="w-0.5 bg-white/80 h-2/3 animate-[pulse_1.2s_ease-in-out_infinite]"></div>
                                    <div className="w-0.5 bg-white/80 h-full animate-[pulse_0.8s_ease-in-out_infinite]"></div>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-sm font-semibold ${config.voiceName === voice.id ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                                    {voice.id}
                                </span>
                                <span className="text-xs text-gray-500">{voice.label}</span>
                            </div>
                            
                            {config.voiceName === voice.id && (
                                <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* System Instructions */}
            <div className="flex flex-col gap-2 flex-1 min-h-[150px]">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        System Instructions
                        <PenTool size={12} className="text-gray-600" />
                    </label>
                    <button 
                        onClick={() => handleChange('systemInstruction', 'You are a smart AI Co-Host for a JournalFX Mentor Session. You are an expert financial analyst.')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 border border-indigo-500/30 px-2 py-1 rounded-md hover:bg-indigo-500/10 transition-colors"
                    >
                        <Sparkles size={10} />
                        Default Persona
                    </button>
                </div>
                <textarea 
                    value={config.systemInstruction}
                    onChange={(e) => handleChange('systemInstruction', e.target.value)}
                    className="flex-1 w-full bg-[#1e2330] border border-gray-700 rounded-xl p-4 text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none font-mono text-sm leading-relaxed"
                    placeholder="Describe how the AI should behave..."
                />
            </div>
        </div>
      </div>
    </div>
  );
};

export default GeminiConfigModal;
