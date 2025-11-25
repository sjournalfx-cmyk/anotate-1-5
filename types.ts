
export type Tool = 
  | 'hand' 
  | 'selection' 
  | 'rectangle' 
  | 'diamond' 
  | 'ellipse' 
  | 'arrow' 
  | 'line' 
  | 'pencil' 
  | 'text' 
  | 'image' 
  | 'eraser'
  | 'long_position'
  | 'short_position'
  | 'path'
  | 'laser';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: Tool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[]; // For pencil and path
  text?: string;    // For text tool
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number; // 0 to 100
  startArrowhead?: 'arrow' | 'dot' | null;
  endArrowhead?: 'arrow' | 'dot' | null;
  
  // For images
  imageData?: string; 
  
  // Text specific
  fontSize?: number;
  fontFamily?: string; // 'Inter', 'Kalam', 'serif', 'monospace'
  fontWeight?: string; // 'normal', 'bold'
  fontStyle?: string;  // 'normal', 'italic'
  textAlign?: 'left' | 'center' | 'right';
  
  // Complex shapes data
  customData?: {
    entryRatio?: number; // 0 to 1, defines where the entry line is relative to height
  };
}

export interface AudioPeer {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  type: 'human' | 'ai';
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}
