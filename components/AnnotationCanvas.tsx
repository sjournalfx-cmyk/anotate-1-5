
import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Tool, DrawingElement, Point } from '../types';
import { 
  Lock, 
  Hand, 
  MousePointer2, 
  Square, 
  Diamond, 
  Circle, 
  ArrowRight, 
  Minus, 
  Pencil, 
  Type, 
  Image as ImageIcon, 
  Eraser, 
  LayoutGrid, 
  Moon, 
  Sun,
  Trash2,
  Grid,
  Plus,
  RotateCcw,
  ArrowUpCircle,
  ArrowDownCircle,
  Waypoints,
  Undo,
  Redo,
  Ruler as RulerIcon,
  Copy,
  Clipboard,
  FileX,
  Wand2,
  Camera,
  Map as MapIcon
} from 'lucide-react';

export interface AnnotationCanvasRef {
    addExternalElement: (element: DrawingElement) => void;
    getCanvas: () => HTMLCanvasElement | null;
}

interface AnnotationCanvasProps {
  onCanvasRef?: (canvas: HTMLCanvasElement) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

interface InteractionState {
    mode: 'none' | 'drawing' | 'moving' | 'resizing' | 'panning' | 'selection_box';
    resizeHandle?: 'tl' | 'tr' | 'bl' | 'br' | 'n' | 's' | 'entry';
    startMousePos: Point;
    startElementSnapshot?: DrawingElement; // State of element before drag/resize (single)
    startElementSnapshots?: Map<string, DrawingElement>; // State of elements before moving (multiple)
}

interface LaserPoint {
    x: number;
    y: number;
    timestamp: number;
}

const HANDLE_SIZE = 8;

const cursorForPosition = (position: string) => {
  switch (position) {
    case 'tl': return 'nwse-resize';
    case 'tr': return 'nesw-resize';
    case 'bl': return 'nesw-resize';
    case 'br': return 'nwse-resize';
    case 'n': return 'ns-resize';
    case 's': return 'ns-resize';
    case 'entry': return 'ns-resize'; 
    case 'inside': return 'move';
    default: return 'default';
  }
};

const getElementBounds = (element: DrawingElement) => {
    if (element.type === 'path' || element.type === 'pencil') {
       if (!element.points || element.points.length === 0) return { minX: element.x, maxX: element.x, minY: element.y, maxY: element.y };
       const xs = element.points.map(p => p.x);
       const ys = element.points.map(p => p.y);
       return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    const { x, y, width = 0, height = 0 } = element;
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);
    return { minX, maxX, minY, maxY };
};

const AnnotationCanvas = forwardRef<AnnotationCanvasRef, AnnotationCanvasProps>(({ onCanvasRef, isDarkMode, onToggleTheme }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const laserPointsRef = useRef<LaserPoint[]>([]);
  
  // Tools & State
  const [tool, setTool] = useState<Tool>('selection');
  const [lockTool, setLockTool] = useState(false);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  
  // Room State
  const [roomTitle, setRoomTitle] = useState("Annotate Room");
  const [clipboard, setClipboard] = useState<DrawingElement[]>([]); 

  // History State
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Style State
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [opacity, setOpacity] = useState(100);
  const [startArrowhead, setStartArrowhead] = useState<'arrow' | 'dot' | null>(null);
  const [endArrowhead, setEndArrowhead] = useState<'arrow' | 'dot' | null>(null);

  // Eraser State
  const [eraserSize, setEraserSize] = useState(30);

  // Text State
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState('Kalam');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  // View Options
  const [showGrid, setShowGrid] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  
  // Pan & Zoom State
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Selection & Transformation State
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; current: Point } | null>(null);
  
  const [interactionState, setInteractionState] = useState<InteractionState>({ mode: 'none', startMousePos: { x: 0, y: 0 } });

  // Load images for rendering
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
      addExternalElement: (element: DrawingElement) => {
          setElements(prev => {
              const next = [...prev, element];
              pushToHistory(next);
              return next;
          });
      },
      getCanvas: () => canvasRef.current
  }));

  // --- History Helpers ---
  const pushToHistory = useCallback((newElements: DrawingElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setElements(history[historyIndex - 1]);
      setSelectedElementIds([]); 
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setElements(history[historyIndex + 1]);
      setSelectedElementIds([]); 
    }
  }, [history, historyIndex]);

  // --- Copy / Paste Logic ---
  const handleCopy = useCallback(() => {
    if (selectedElementIds.length > 0) {
      const els = elements.filter(e => selectedElementIds.includes(e.id));
      if (els.length > 0) {
          setClipboard(JSON.parse(JSON.stringify(els)));
      }
    }
  }, [selectedElementIds, elements]);

  const handlePaste = useCallback(() => {
    if (clipboard.length > 0) {
      const offset = 20 / scale;
      const newIds: string[] = [];
      const pastedElements = clipboard.map(item => {
          const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
          newIds.push(newId);
          const newEl = {
             ...item,
             id: newId,
             x: item.x + offset,
             y: item.y + offset
          };
          if ((newEl.type === 'path' || newEl.type === 'pencil') && newEl.points) {
             newEl.points = newEl.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
          }
          return newEl;
      });

      const newElements = [...elements, ...pastedElements];
      setElements(newElements);
      pushToHistory(newElements);
      setSelectedElementIds(newIds);
    }
  }, [clipboard, scale, elements, pushToHistory]);

  const handleDelete = useCallback(() => {
      if (selectedElementIds.length > 0) {
          const newElements = elements.filter(el => !selectedElementIds.includes(el.id));
          setElements(newElements);
          pushToHistory(newElements);
          setSelectedElementIds([]);
      } else {
          if (elements.length > 0 && window.confirm("Clear entire board?")) {
              setElements([]);
              pushToHistory([]);
          }
      }
  }, [selectedElementIds, elements, pushToHistory]);

  const handleSnapshot = () => {
      const canvas = canvasRef.current;
      if (!canvas || elements.length === 0) return;

      // 1. Calculate Bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      elements.forEach(el => {
          const b = getElementBounds(el);
          minX = Math.min(minX, b.minX);
          minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX);
          maxY = Math.max(maxY, b.maxY);
      });
      
      const padding = 50;
      minX -= padding; minY -= padding; maxX += padding; maxY += padding;
      const width = maxX - minX;
      const height = maxY - minY;

      // 2. Create Temp Canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      // 3. Draw
      ctx.fillStyle = isDarkMode ? '#121212' : '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.translate(-minX, -minY);
      
      elements.forEach(el => drawElement(ctx, el, 1)); // Scale 1

      // 4. Download
      const link = document.createElement('a');
      link.download = `forex-analysis-${Date.now()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
  };

  // Global Event Listeners (Paste, Drop)
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => {
         const items = e.clipboardData?.items;
         if (items) {
             for (let i = 0; i < items.length; i++) {
                 if (items[i].type.indexOf('image') !== -1) {
                     const blob = items[i].getAsFile();
                     if (blob) processImageFile(blob);
                 }
             }
         }
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
            processImageFile(files[0]);
        }
    };

    window.addEventListener('paste', handlePasteEvent);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
        window.removeEventListener('paste', handlePasteEvent);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('drop', handleDrop);
    };
  }, [panOffset, scale]);

  const processImageFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
          const result = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              const id = Date.now().toString();
              const MAX_DIM = 600;
              let width = img.width;
              let height = img.height;
              if (width > MAX_DIM || height > MAX_DIM) {
                  const ratio = width / height;
                  if (width > height) { width = MAX_DIM; height = width / ratio; } 
                  else { height = MAX_DIM; width = height * ratio; }
              }
              const centerX = (window.innerWidth / 2 - panOffset.x) / scale;
              const centerY = (window.innerHeight / 2 - panOffset.y) / scale;
              const newEl: DrawingElement = {
                  id, type: 'image', x: centerX - width / 2, y: centerY - height / 2, width, height, imageData: result, strokeColor: 'transparent', backgroundColor: 'transparent', strokeWidth: 0
              };
              imageCache.current.set(id, img);
              setElements(prev => {
                  const next = [...prev, newEl];
                  pushToHistory(next);
                  return next;
              });
              setTool('selection');
          };
          img.src = result;
      };
      reader.readAsDataURL(file);
  };

  // Handle Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isCtrlOrMeta && e.key.toLowerCase() === 'c') { e.preventDefault(); handleCopy(); return; }
      if (isCtrlOrMeta && e.key.toLowerCase() === 'v') { e.preventDefault(); handlePaste(); return; }
      if (isCtrlOrMeta && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (isCtrlOrMeta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.code === 'Space' && !isSpacePressed) setIsSpacePressed(true);
      if ((e.key === 'Delete' || e.key === 'Backspace')) handleDelete();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, selectedElementIds, elements, undo, redo, pushToHistory, handleCopy, handlePaste, handleDelete]);

  const effectiveTool = isSpacePressed ? 'hand' : tool;

  // Sync selection styles
  useEffect(() => {
    if (selectedElementIds.length > 0) {
      const lastId = selectedElementIds[selectedElementIds.length - 1];
      const el = elements.find(e => e.id === lastId);
      if (el) {
        setStrokeColor(el.strokeColor);
        setStrokeWidth(el.strokeWidth);
        setStrokeStyle(el.strokeStyle || 'solid');
        setOpacity(el.opacity ?? 100);
        setStartArrowhead(el.startArrowhead || null);
        setEndArrowhead(el.endArrowhead || null);
        
        if (el.fontSize) setFontSize(el.fontSize);
        if (el.textAlign) setTextAlign(el.textAlign);
        if (el.fontFamily) setFontFamily(el.fontFamily);
        if (el.fontWeight) setFontWeight(el.fontWeight);
        if (el.fontStyle) setFontStyle(el.fontStyle);
      }
    }
  }, [selectedElementIds, elements]);

  const updateSelectedElements = (updates: Partial<DrawingElement>) => {
    if (selectedElementIds.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const newElements = elements.map(el => {
      if (selectedElementIds.includes(el.id)) {
        const updatedEl = { ...el, ...updates };
        if (updatedEl.type === 'text' && ctx) {
            ctx.save();
            const fontStr = `${updatedEl.fontStyle || 'normal'} ${updatedEl.fontWeight || 'normal'} ${updatedEl.fontSize || 24}px '${updatedEl.fontFamily || 'Kalam'}'`;
            ctx.font = fontStr;
            const metrics = ctx.measureText(updatedEl.text || '');
            updatedEl.width = metrics.width;
            updatedEl.height = (updatedEl.fontSize || 24) * 1.2;
            ctx.restore();
        }
        return updatedEl;
      }
      return el;
    });
    setElements(newElements);
    pushToHistory(newElements);
  };

  // --- Geometry Helpers ---

  const getMousePos = (e: React.MouseEvent | MouseEvent): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panOffset.x) / scale,
      y: (e.clientY - rect.top - panOffset.y) / scale
    };
  };

  const isPointInElement = (x: number, y: number, element: DrawingElement) => {
    const buffer = 10 / scale;
    const bounds = getElementBounds(element);
    return x >= bounds.minX - buffer && x <= bounds.maxX + buffer &&
           y >= bounds.minY - buffer && y <= bounds.maxY + buffer;
  };

  const getResizeHandleAtPosition = (x: number, y: number, element: DrawingElement): 'tl' | 'tr' | 'bl' | 'br' | 'n' | 's' | 'entry' | null => {
    if (!['rectangle', 'diamond', 'ellipse', 'image', 'long_position', 'short_position'].includes(element.type)) return null;

    const { x: ex, y: ey, width: w = 0, height: h = 0 } = element;
    const handleRadius = (HANDLE_SIZE / 2) / scale;
    
    const x1 = Math.min(ex, ex + w);
    const x2 = Math.max(ex, ex + w);
    const y1 = Math.min(ey, ey + h);
    const y2 = Math.max(ey, ey + h);

    if (Math.abs(x - x1) < handleRadius && Math.abs(y - y1) < handleRadius) return 'tl';
    if (Math.abs(x - x2) < handleRadius && Math.abs(y - y1) < handleRadius) return 'tr';
    if (Math.abs(x - x1) < handleRadius && Math.abs(y - y2) < handleRadius) return 'bl';
    if (Math.abs(x - x2) < handleRadius && Math.abs(y - y2) < handleRadius) return 'br';

    if (element.type === 'long_position' || element.type === 'short_position') {
       const midX = x1 + (x2 - x1) / 2;
       if (Math.abs(x - midX) < handleRadius && Math.abs(y - y1) < handleRadius) return 'n';
       if (Math.abs(x - midX) < handleRadius && Math.abs(y - y2) < handleRadius) return 's';
       const entryRatio = element.customData?.entryRatio ?? 0.5;
       const entryY = y1 + Math.abs(h) * entryRatio;
       if (Math.abs(x - x2) < handleRadius && Math.abs(y - entryY) < handleRadius) return 'entry';
    }
    return null;
  };

  const normalizeElement = (element: DrawingElement): DrawingElement => {
    if (['rectangle', 'diamond', 'ellipse', 'image', 'long_position', 'short_position'].includes(element.type)) {
        const { x, y, width = 0, height = 0 } = element;
        if (width < 0 || height < 0) {
            return {
                ...element,
                x: width < 0 ? x + width : x,
                y: height < 0 ? y + height : y,
                width: Math.abs(width),
                height: Math.abs(height)
            };
        }
    }
    return element;
  };

  // --- Rendering ---

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, currentScale: number) => {
    ctx.save();
    ctx.strokeStyle = isDarkMode ? '#333' : '#e5e7eb';
    ctx.lineWidth = 1 / currentScale; 
    
    const gridSize = 20;
    const left = -panOffset.x / currentScale;
    const top = -panOffset.y / currentScale;
    const right = (width - panOffset.x) / currentScale;
    const bottom = (height - panOffset.y) / currentScale;
    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;

    ctx.beginPath();
    for (let x = startX; x < right; x += gridSize) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y < bottom; y += gridSize) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawRulers = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    const rulerSize = 24; 
    const bgColor = isDarkMode ? '#1f2937' : '#f3f4f6';
    const fgColor = isDarkMode ? '#9ca3af' : '#6b7280';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, rulerSize); 
    ctx.fillRect(0, rulerSize, rulerSize, h - rulerSize);
    ctx.fillStyle = isDarkMode ? '#374151' : '#e5e7eb';
    ctx.fillRect(0, 0, rulerSize, rulerSize);
    ctx.fillStyle = fgColor;
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 1;
    ctx.font = `10px Inter, sans-serif`;
    let step = 100; 
    while (step * scale < 60) step *= 2;
    while (step * scale > 140) step /= 2;
    const startX = -panOffset.x / scale;
    const endX = (w - panOffset.x) / scale;
    const firstTickX = Math.floor(startX / step) * step;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let val = firstTickX; val < endX; val += step) {
        const screenX = val * scale + panOffset.x;
        if (screenX < rulerSize) continue;
        ctx.beginPath(); ctx.moveTo(screenX, 15); ctx.lineTo(screenX, rulerSize); ctx.stroke();
        ctx.fillText(Math.round(val).toString(), screenX + 2, 2);
    }
    const startY = -panOffset.y / scale;
    const endY = (h - panOffset.y) / scale;
    const firstTickY = Math.floor(startY / step) * step;
    for (let val = firstTickY; val < endY; val += step) {
        const screenY = val * scale + panOffset.y;
        if (screenY < rulerSize) continue;
        ctx.beginPath(); ctx.moveTo(15, screenY); ctx.lineTo(rulerSize, screenY); ctx.stroke();
        ctx.save(); ctx.translate(2, screenY + 2); ctx.rotate(Math.PI / 2);
        ctx.fillText(Math.round(val).toString(), 0, 0); ctx.restore();
    }
    ctx.restore();
  };

  const drawArrowhead = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, type: string) => {
     const headLength = 15;
     ctx.beginPath();
     if (type === 'arrow') {
         ctx.moveTo(x, y);
         ctx.lineTo(x - headLength * Math.cos(angle - Math.PI / 6), y - headLength * Math.sin(angle - Math.PI / 6));
         ctx.moveTo(x, y);
         ctx.lineTo(x - headLength * Math.cos(angle + Math.PI / 6), y - headLength * Math.sin(angle + Math.PI / 6));
         ctx.stroke();
     } else if (type === 'dot') {
         ctx.fillStyle = ctx.strokeStyle;
         ctx.arc(x, y, 4, 0, 2 * Math.PI);
         ctx.fill();
     }
  };

  const drawSelectionBorder = (ctx: CanvasRenderingContext2D, element: DrawingElement, showHandles: boolean) => {
     const { minX, minY, maxX, maxY } = getElementBounds(element);
     const absW = maxX - minX;
     const absH = maxY - minY;

     ctx.save();
     ctx.strokeStyle = '#8b5cf6'; // Violet
     ctx.lineWidth = 2 / scale;
     ctx.shadowColor = '#8b5cf6';
     ctx.shadowBlur = 8;
     ctx.setLineDash([5 / scale, 5 / scale]);
     ctx.strokeRect(minX - 5/scale, minY - 5/scale, absW + 10/scale, absH + 10/scale);
     
     if (showHandles && ['rectangle', 'diamond', 'ellipse', 'image', 'long_position', 'short_position'].includes(element.type)) {
         ctx.setLineDash([]);
         ctx.shadowBlur = 0; 
         ctx.fillStyle = '#ffffff';
         const handleSize = HANDLE_SIZE / scale;
         const half = handleSize / 2;

         const drawHandle = (hx: number, hy: number, color?: string) => {
             ctx.save();
             if (color) ctx.fillStyle = color;
             ctx.beginPath();
             ctx.rect(hx - half, hy - half, handleSize, handleSize);
             ctx.fill();
             ctx.stroke();
             ctx.restore();
         };

         const { x, y, width = 0, height = 0 } = element;
         const ex = x; 
         const ey = y;
         const ew = width;
         const eh = height;
         
         const hx1 = Math.min(ex, ex + ew);
         const hx2 = Math.max(ex, ex + ew);
         const hy1 = Math.min(ey, ey + eh);
         const hy2 = Math.max(ey, ey + eh);

         drawHandle(hx1, hy1);
         drawHandle(hx2, hy1);
         drawHandle(hx1, hy2);
         drawHandle(hx2, hy2);

         if (element.type === 'long_position' || element.type === 'short_position') {
            const midX = hx1 + (hx2 - hx1) / 2;
            const entryRatio = element.customData?.entryRatio ?? 0.5;
            const entryY = hy1 + (hy2 - hy1) * entryRatio;
            drawHandle(midX, hy1);
            drawHandle(midX, hy2);
            drawHandle(hx2, entryY, '#fbbf24');
         }
     }
     ctx.restore();
  };

  const drawElement = (ctx: CanvasRenderingContext2D, element: DrawingElement, drawScale: number = 1) => {
    ctx.save();
    ctx.globalAlpha = (element.opacity ?? 100) / 100;
    ctx.strokeStyle = element.strokeColor;
    ctx.fillStyle = element.strokeColor;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (element.strokeStyle === 'dashed') {
        ctx.setLineDash([10, 10]);
    } else if (element.strokeStyle === 'dotted') {
        ctx.setLineDash([5, 10]);
    }

    const { x, y, width = 0, height = 0 } = element;

    switch (element.type) {
      case 'pencil':
        if (element.points && element.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(element.points[i].x, element.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'path':
        if (element.points && element.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(element.points[i].x, element.points[i].y);
          }
          ctx.stroke();
          
          if (element.startArrowhead || element.endArrowhead) {
              if (element.startArrowhead && element.points.length > 1) {
                  const p0 = element.points[0];
                  const p1 = element.points[1];
                  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
                  drawArrowhead(ctx, p0.x, p0.y, angle + Math.PI, element.startArrowhead);
              }
              if (element.endArrowhead && element.points.length > 1) {
                  const pLast = element.points[element.points.length - 1];
                  const pPrev = element.points[element.points.length - 2];
                  const angle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
                  drawArrowhead(ctx, pLast.x, pLast.y, angle, element.endArrowhead);
              }
          }
          
          ctx.setLineDash([]); 
          ctx.fillStyle = '#ffffff';
          const radius = 3 / drawScale;
          for (let i = 0; i < element.points.length; i++) {
              ctx.beginPath();
              ctx.arc(element.points[i].x, element.points[i].y, radius, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
          }
        }
        break;
      case 'rectangle':
        ctx.strokeRect(x, y, width, height);
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height / 2);
        ctx.lineTo(x + width / 2, y + height);
        ctx.lineTo(x, y + height / 2);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'arrow':
      case 'line':
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
        const angle = Math.atan2(height, width);
        const effectiveEndArrow = element.type === 'arrow' ? (element.endArrowhead || 'arrow') : element.endArrowhead;
        if (element.startArrowhead) drawArrowhead(ctx, x, y, angle + Math.PI, element.startArrowhead);
        if (effectiveEndArrow) drawArrowhead(ctx, x + width, y + height, angle, effectiveEndArrow);
        break;
      case 'text':
        if (element.text) {
          const fontStr = `${element.fontStyle || 'normal'} ${element.fontWeight || 'normal'} ${element.fontSize || 24}px '${element.fontFamily || 'Kalam'}'`;
          ctx.font = fontStr;
          ctx.textAlign = element.textAlign || 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(element.text, x, y);
        }
        break;
      case 'image':
        if (element.imageData) {
           let img = imageCache.current.get(element.id);
           if (!img) {
               img = new Image();
               img.src = element.imageData;
               imageCache.current.set(element.id, img);
           }
           if (img.complete) {
               ctx.drawImage(img, x, y, width, height);
           }
        }
        break;
      case 'long_position':
      case 'short_position':
        {
           const entryRatio = element.customData?.entryRatio ?? 0.5;
           const absW = Math.abs(width);
           const absH = Math.abs(height);
           const startX = width < 0 ? x + width : x;
           const startY = height < 0 ? y + height : y;
           const entryY = startY + absH * entryRatio;
           const isLong = element.type === 'long_position';
           
           const profitColor = 'rgba(34, 197, 94, 0.2)';
           const profitBorder = '#15803d';
           const lossColor = 'rgba(239, 68, 68, 0.2)';
           const lossBorder = '#b91c1c';

           const topRectColor = isLong ? profitColor : lossColor;
           const topRectBorder = isLong ? profitBorder : lossBorder;
           const botRectColor = isLong ? lossColor : profitColor;
           const botRectBorder = isLong ? lossBorder : profitBorder;

           ctx.setLineDash([]); 
           
           ctx.fillStyle = topRectColor;
           ctx.strokeStyle = topRectBorder;
           ctx.lineWidth = 1;
           ctx.fillRect(startX, startY, absW, entryY - startY);
           ctx.strokeRect(startX, startY, absW, entryY - startY);

           ctx.fillStyle = botRectColor;
           ctx.strokeStyle = botRectBorder;
           ctx.fillRect(startX, entryY, absW, startY + absH - entryY);
           ctx.strokeRect(startX, entryY, absW, startY + absH - entryY);

           ctx.strokeStyle = '#6b7280';
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(startX, entryY);
           ctx.lineTo(startX + absW, entryY);
           ctx.stroke();
        }
        break;
    }
    ctx.restore();
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isDarkMode ? '#121212' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);
    
    if (showGrid) drawGrid(ctx, canvas.width, canvas.height, scale);

    elements.forEach(el => {
        const isHovered = el.id === hoveredElementId;
        const isSelected = selectedElementIds.includes(el.id);

        ctx.save();
        if (isSelected) {
            ctx.shadowColor = "rgba(139, 92, 246, 0.6)"; 
            ctx.shadowBlur = 12;
        } else if (isHovered) {
             ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
             ctx.shadowBlur = 8;
        }

        drawElement(ctx, el, scale);
        ctx.restore();
    });

    if (currentElement) drawElement(ctx, currentElement, scale);
    
    // Draw Laser Points
    if (laserPointsRef.current.length > 0) {
        const now = Date.now();
        // Prune old points
        laserPointsRef.current = laserPointsRef.current.filter(p => now - p.timestamp < 1000);
        
        if (laserPointsRef.current.length > 1) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 1; i < laserPointsRef.current.length; i++) {
                const p1 = laserPointsRef.current[i-1];
                const p2 = laserPointsRef.current[i];
                const age = now - p2.timestamp;
                const opacity = Math.max(0, 1 - age / 1000);
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
                ctx.lineWidth = 4 * opacity;
                ctx.stroke();
            }
            ctx.restore();
            // Force re-render while laser is active
            requestAnimationFrame(renderCanvas);
        }
    }

    selectedElementIds.forEach(id => {
        const el = elements.find(e => e.id === id);
        if (el) {
            drawSelectionBorder(ctx, el, selectedElementIds.length === 1);
        }
    });

    if (selectionBox) {
        const x = Math.min(selectionBox.start.x, selectionBox.current.x);
        const y = Math.min(selectionBox.start.y, selectionBox.current.y);
        const w = Math.abs(selectionBox.current.x - selectionBox.start.x);
        const h = Math.abs(selectionBox.current.y - selectionBox.start.y);

        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    if (showRuler) {
       drawRulers(ctx, canvas.width, canvas.height);
    }
    
    ctx.restore();
  }, [elements, currentElement, isDarkMode, panOffset, scale, showGrid, showRuler, selectedElementIds, hoveredElementId, selectionBox]);

  // Minimap Rendering
  useEffect(() => {
    if (!showMinimap || !minimapRef.current || elements.length === 0) return;
    const ctx = minimapRef.current.getContext('2d');
    if (!ctx) return;
    const mmW = minimapRef.current.width;
    const mmH = minimapRef.current.height;

    ctx.clearRect(0, 0, mmW, mmH);
    ctx.fillStyle = isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)';
    ctx.fillRect(0, 0, mmW, mmH);

    // Calculate total bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(el => {
        const b = getElementBounds(el);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
    });

    // Add view bounds
    if (canvasRef.current) {
        const viewX = -panOffset.x / scale;
        const viewY = -panOffset.y / scale;
        const viewW = canvasRef.current.width / scale;
        const viewH = canvasRef.current.height / scale;
        minX = Math.min(minX, viewX);
        minY = Math.min(minY, viewY);
        maxX = Math.max(maxX, viewX + viewW);
        maxY = Math.max(maxY, viewY + viewH);
    }

    // Add padding
    const padding = 100;
    minX -= padding; minY -= padding; maxX += padding; maxY += padding;
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;

    const scaleX = mmW / worldW;
    const scaleY = mmH / worldH;
    const mmScale = Math.min(scaleX, scaleY);

    const offsetX = (mmW - worldW * mmScale) / 2;
    const offsetY = (mmH - worldH * mmScale) / 2;

    // Draw Elements
    ctx.fillStyle = isDarkMode ? '#888' : '#ccc';
    elements.forEach(el => {
        const b = getElementBounds(el);
        const ex = (b.minX - minX) * mmScale + offsetX;
        const ey = (b.minY - minY) * mmScale + offsetY;
        const ew = (b.maxX - b.minX) * mmScale;
        const eh = (b.maxY - b.minY) * mmScale;
        ctx.fillRect(ex, ey, Math.max(2, ew), Math.max(2, eh));
    });

    // Draw Viewport
    if (canvasRef.current) {
        const vx = (-panOffset.x / scale - minX) * mmScale + offsetX;
        const vy = (-panOffset.y / scale - minY) * mmScale + offsetY;
        const vw = (canvasRef.current.width / scale) * mmScale;
        const vh = (canvasRef.current.height / scale) * mmScale;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);
    }

  }, [elements, panOffset, scale, isDarkMode, showMinimap]);


  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        renderCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    if (canvasRef.current && onCanvasRef) onCanvasRef(canvasRef.current);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas, onCanvasRef]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // --- Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);

    if (effectiveTool === 'laser') {
        setInteractionState({ mode: 'drawing', startMousePos: { x, y } });
        laserPointsRef.current.push({ x, y, timestamp: Date.now() });
        renderCanvas();
        return;
    }

    if (effectiveTool === 'hand') {
        setInteractionState({ mode: 'panning', startMousePos: { x: e.clientX, y: e.clientY } });
        return;
    }

    // SELECTION TOOL LOGIC
    if (effectiveTool === 'selection') {
        if (selectedElementIds.length === 1) {
            const selectedEl = elements.find(el => el.id === selectedElementIds[0]);
            if (selectedEl) {
                const handle = getResizeHandleAtPosition(x, y, selectedEl);
                if (handle) {
                    setInteractionState({ 
                        mode: 'resizing', 
                        resizeHandle: handle, 
                        startMousePos: { x, y }, 
                        startElementSnapshot: { ...selectedEl } 
                    });
                    return;
                }
            }
        }

        let clickedId = null;
        for (let i = elements.length - 1; i >= 0; i--) {
            if (isPointInElement(x, y, elements[i])) {
                clickedId = elements[i].id;
                break;
            }
        }

        if (clickedId) {
             const isShift = e.shiftKey;
             const isAlreadySelected = selectedElementIds.includes(clickedId);
             
             let newSelection = [...selectedElementIds];
             
             if (isShift) {
                 if (isAlreadySelected) newSelection = newSelection.filter(id => id !== clickedId);
                 else newSelection.push(clickedId);
                 
                 setSelectedElementIds(newSelection);
                 if (isAlreadySelected) return; 
             } else {
                 if (!isAlreadySelected) {
                     newSelection = [clickedId];
                     setSelectedElementIds(newSelection);
                 }
             }

             const snapshots = new Map<string, DrawingElement>();
             elements.forEach(el => {
                 if (newSelection.includes(el.id)) {
                     snapshots.set(el.id, { ...el });
                 }
             });

             setInteractionState({
                mode: 'moving',
                startMousePos: { x, y },
                startElementSnapshots: snapshots
             });
             return;
        }

        if (!e.shiftKey) setSelectedElementIds([]);
        setSelectionBox({ start: { x, y }, current: { x, y } });
        setInteractionState({ mode: 'selection_box', startMousePos: { x, y } });
        return;
    }

    const id = Date.now().toString();
    if (effectiveTool === 'text') {
        requestAnimationFrame(() => {
            const text = prompt("Enter text:");
            if(text) {
                 const canvas = canvasRef.current;
                 const ctx = canvas?.getContext('2d');
                 let textWidth = 100;
                 let textHeight = fontSize * 1.2;
                 
                 if (ctx) {
                     ctx.save();
                     ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px '${fontFamily}'`;
                     const metrics = ctx.measureText(text);
                     textWidth = metrics.width;
                     ctx.restore();
                 }
    
                 const newEl: DrawingElement = {
                    id, type: 'text', x, y, width: textWidth, height: textHeight, text,
                    strokeColor: strokeColor === '#000000' && !isDarkMode ? '#000000' : (isDarkMode ? '#e0e0e0' : strokeColor),
                    backgroundColor: 'transparent', strokeWidth, fontSize, fontFamily, fontWeight, fontStyle, textAlign, opacity
                };
                
                setElements(prev => {
                    const next = [...prev, newEl];
                    pushToHistory(next);
                    return next;
                });
                setSelectedElementIds([id]); 
            }
            if (!lockTool) setTool('selection');
        });
        return;
    }

    if (effectiveTool === 'path') {
        if (e.detail === 2 && currentElement && currentElement.type === 'path') {
            const finalPath = { ...currentElement };
            if (finalPath.points) {
                const xs = finalPath.points.map(p => p.x);
                const ys = finalPath.points.map(p => p.y);
                finalPath.x = Math.min(...xs);
                finalPath.y = Math.min(...ys);
                finalPath.width = Math.max(...xs) - finalPath.x;
                finalPath.height = Math.max(...ys) - finalPath.y;
            }
            const newElements = [...elements, finalPath];
            setElements(newElements);
            pushToHistory(newElements);
            setCurrentElement(null);
            setSelectedElementIds([finalPath.id]);
            setInteractionState({ mode: 'none', startMousePos: { x, y } });
            if (!lockTool) setTool('selection');
            return;
        }

        if (!currentElement) {
             setInteractionState({ mode: 'drawing', startMousePos: { x, y } });
             setCurrentElement({
                id, type: 'path', x, y, points: [{x, y}, {x, y}],
                strokeColor: isDarkMode ? '#e0e0e0' : strokeColor, backgroundColor: 'transparent',
                strokeWidth, strokeStyle, opacity, startArrowhead, endArrowhead
             });
        } else {
             setCurrentElement(prev => {
                if (!prev || !prev.points) return prev;
                const pts = [...prev.points];
                pts[pts.length - 1] = {x, y};
                return { ...prev, points: [...pts, {x, y}] };
             });
        }
        return;
    }

    setInteractionState({ mode: 'drawing', startMousePos: { x, y } });
    
    const baseElement: DrawingElement = {
      id, type: effectiveTool, x, y, width: 0, height: 0,
      strokeColor: isDarkMode ? '#e0e0e0' : strokeColor, backgroundColor: 'transparent',
      strokeWidth, strokeStyle, opacity, startArrowhead, endArrowhead
    };

    if (effectiveTool === 'pencil') {
        setCurrentElement({ ...baseElement, points: [{ x, y }] });
    } else if (effectiveTool === 'long_position' || effectiveTool === 'short_position') {
        setCurrentElement({ ...baseElement, width: 100, height: 100, customData: { entryRatio: 0.5 } });
    } else {
        setCurrentElement(baseElement);
    }
  };
  
  const handleDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const clickedElement = elements.slice().reverse().find(el => isPointInElement(x, y, el));
    
    if (clickedElement && clickedElement.type === 'text') {
       requestAnimationFrame(() => {
           const newText = prompt("Edit text:", clickedElement.text);
           if (newText !== null && newText !== clickedElement.text) {
               const canvas = canvasRef.current;
               const ctx = canvas?.getContext('2d');
               let textWidth = clickedElement.width;
               if (ctx) {
                    ctx.save();
                    const fontStr = `${clickedElement.fontStyle || 'normal'} ${clickedElement.fontWeight || 'normal'} ${clickedElement.fontSize || 24}px '${clickedElement.fontFamily || 'Kalam'}'`;
                    ctx.font = fontStr;
                    const metrics = ctx.measureText(newText);
                    textWidth = metrics.width;
                    ctx.restore();
               }
               const newElements = elements.map(el => 
                   el.id === clickedElement.id ? { ...el, text: newText, width: textWidth } : el
               );
               setElements(newElements);
               pushToHistory(newElements);
           }
       });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getMousePos(e);

      if (effectiveTool === 'laser' && interactionState.mode === 'drawing') {
          laserPointsRef.current.push({ x, y, timestamp: Date.now() });
          return;
      }

      if (effectiveTool === 'selection' && interactionState.mode === 'none') {
          if (selectedElementIds.length === 1) {
               const el = elements.find(e => e.id === selectedElementIds[0]);
               if (el) {
                   const handle = getResizeHandleAtPosition(x, y, el);
                   if (handle) {
                       e.currentTarget.style.cursor = cursorForPosition(handle);
                       if (hoveredElementId !== null) setHoveredElementId(null);
                       return;
                   }
               }
          }
          
          let foundId: string | null = null;
          for (let i = elements.length - 1; i >= 0; i--) {
              if (isPointInElement(x, y, elements[i])) {
                  foundId = elements[i].id;
                  break;
              }
          }
          if (foundId !== hoveredElementId) setHoveredElementId(foundId);
          e.currentTarget.style.cursor = foundId ? 'move' : 'default';
      } else if (effectiveTool === 'hand' || interactionState.mode === 'panning') {
          e.currentTarget.style.cursor = interactionState.mode === 'panning' ? 'grabbing' : 'grab';
          if (hoveredElementId !== null) setHoveredElementId(null);
      } else {
          e.currentTarget.style.cursor = 'crosshair';
          if (hoveredElementId !== null) setHoveredElementId(null);
      }
  
      if (interactionState.mode === 'panning') {
          const dx = e.clientX - interactionState.startMousePos.x;
          const dy = e.clientY - interactionState.startMousePos.y;
          setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          setInteractionState(prev => ({ ...prev, startMousePos: { x: e.clientX, y: e.clientY } }));
          return;
      }
      
      if (interactionState.mode === 'selection_box') {
          setSelectionBox(prev => prev ? { ...prev, current: { x, y } } : null);
          return;
      }
  
      if (interactionState.mode === 'moving' && interactionState.startElementSnapshots) {
          const dx = x - interactionState.startMousePos.x;
          const dy = y - interactionState.startMousePos.y;
          
          setElements(prev => prev.map(el => {
              if (interactionState.startElementSnapshots?.has(el.id)) {
                  const snapshot = interactionState.startElementSnapshots.get(el.id)!;
                  const newEl = { ...snapshot, x: snapshot.x + dx, y: snapshot.y + dy };
                  if ((newEl.type === 'pencil' || newEl.type === 'path') && snapshot.points) {
                      newEl.points = snapshot.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                  }
                  return newEl;
              }
              return el;
          }));
          return;
      }
  
      if (interactionState.mode === 'resizing' && selectedElementIds.length === 1 && interactionState.startElementSnapshot && interactionState.resizeHandle) {
          const dx = x - interactionState.startMousePos.x;
          const dy = y - interactionState.startMousePos.y;
          const snapshot = interactionState.startElementSnapshot;
          const handle = interactionState.resizeHandle;
          const selectedId = selectedElementIds[0];
  
          setElements(prev => prev.map(el => {
              if (el.id === selectedId) {
                  let nx = snapshot.x;
                  let ny = snapshot.y;
                  let nw = snapshot.width || 0;
                  let nh = snapshot.height || 0;
                  let newCustomData = { ...el.customData };
  
                  if (handle === 'entry') {
                       const relY = (y - ny);
                       const ratio = Math.min(Math.max(relY / Math.abs(nh), 0.05), 0.95);
                       newCustomData.entryRatio = ratio;
                       return { ...el, customData: newCustomData };
                  } else if (handle === 'n') { ny += dy; nh -= dy; } 
                  else if (handle === 's') { nh += dy; } 
                  else {
                      if (handle.includes('e')) nw += dx;
                      if (handle.includes('s')) nh += dy;
                      if (handle.includes('w')) { nx += dx; nw -= dx; }
                      if (handle.includes('n')) { ny += dy; nh -= dy; }
                  }
                  return { ...el, x: nx, y: ny, width: nw, height: nh, customData: newCustomData };
              }
              return el;
          }));
          return;
      }
  
      if (interactionState.mode === 'drawing') {
          if (effectiveTool === 'path' && currentElement) {
               setCurrentElement(prev => {
                  if (!prev || !prev.points) return prev;
                  const pts = [...prev.points];
                  pts[pts.length - 1] = {x, y};
                  return { ...prev, points: pts };
               });
          }
          else if (currentElement) {
              if (effectiveTool === 'pencil') {
                setCurrentElement(prev => ({
                  ...prev!,
                  points: [...(prev!.points || []), { x, y }],
                  width: Math.max(prev!.width || 0, x - prev!.x),
                  height: Math.max(prev!.height || 0, y - prev!.y) 
                }));
              } else if (['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'image', 'long_position', 'short_position'].includes(effectiveTool)) {
                setCurrentElement(prev => ({
                  ...prev!,
                  width: x - prev!.x,
                  height: y - prev!.y
                }));
              } else if (effectiveTool === 'eraser') {
                  setElements(prev => prev.filter(el => {
                      const dist = Math.sqrt(Math.pow(el.x - x, 2) + Math.pow(el.y - y, 2));
                      return dist > (eraserSize / scale);
                  }));
              }
          }
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (effectiveTool === 'path') return;
    if (effectiveTool === 'laser') {
        setInteractionState({ mode: 'none', startMousePos: { x: 0, y: 0 } });
        return;
    }

    if (interactionState.mode === 'selection_box' && selectionBox) {
        const x1 = Math.min(selectionBox.start.x, selectionBox.current.x);
        const x2 = Math.max(selectionBox.start.x, selectionBox.current.x);
        const y1 = Math.min(selectionBox.start.y, selectionBox.current.y);
        const y2 = Math.max(selectionBox.start.y, selectionBox.current.y);

        const idsInBox = elements.filter(el => {
            const b = getElementBounds(el);
            return b.minX >= x1 && b.maxX <= x2 && b.minY >= y1 && b.maxY <= y2;
        }).map(el => el.id);

        setSelectedElementIds(prev => e.shiftKey ? Array.from(new Set([...prev, ...idsInBox])) : idsInBox);
        setSelectionBox(null);
    }

    if (interactionState.mode === 'drawing' && currentElement) {
        let finalElement = { ...currentElement };
        if (finalElement.type === 'pencil' && finalElement.points) {
            const xs = finalElement.points.map(p => p.x);
            const ys = finalElement.points.map(p => p.y);
            finalElement.x = Math.min(...xs);
            finalElement.y = Math.min(...ys);
            finalElement.width = Math.max(...xs) - finalElement.x;
            finalElement.height = Math.max(...ys) - finalElement.y;
        }
        finalElement = normalizeElement(finalElement);
        if (effectiveTool !== 'eraser') {
             const newElements = [...elements, finalElement];
             setElements(newElements);
             setSelectedElementIds([finalElement.id]);
             pushToHistory(newElements);
        }
    }
    if (effectiveTool === 'eraser' && interactionState.mode === 'drawing') {
       if (elements !== history[historyIndex]) pushToHistory(elements);
    }
    if (interactionState.mode === 'resizing' && selectedElementIds.length === 1) {
        const id = selectedElementIds[0];
        const newElements = elements.map(el => el.id === id ? normalizeElement(el) : el);
        setElements(newElements);
        pushToHistory(newElements);
    }
    if (interactionState.mode === 'moving') {
        if (elements !== history[historyIndex]) pushToHistory(elements);
    }

    setInteractionState({ mode: 'none', startMousePos: { x: 0, y: 0 } });
    setCurrentElement(null);
    
    if (!lockTool && interactionState.mode === 'drawing') {
        if (effectiveTool !== 'pencil' && effectiveTool !== 'eraser') setTool('selection');
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = Math.pow(1.001, delta); 
        const newScale = Math.min(Math.max(0.1, scale * factor), 5);
        
        const rect = canvasRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - panOffset.x) / scale;
        const worldY = (mouseY - panOffset.y) / scale;
        const newPanX = mouseX - worldX * newScale;
        const newPanY = mouseY - worldY * newScale;
        
        setScale(newScale);
        setPanOffset({ x: newPanX, y: newPanY });
    } else {
        setPanOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processImageFile(file);
      e.target.value = '';
  };

  const updateZoom = (delta: number) => setScale(prev => Math.min(Math.max(0.1, prev + delta), 5));

  // --- Components ---
  const ToolButton = ({ t, icon: Icon, label, isActiveOverride }: { t?: Tool, icon: any, label?: string, isActiveOverride?: boolean }) => {
    const active = isActiveOverride ?? (tool === t);
    
    const handleClick = () => {
        if (t === 'image') fileInputRef.current?.click();
        else if (t) { 
            setTool(t); 
            setSelectedElementIds([]); 
            setCurrentElement(null); 
        }
    };
    
    const handleDoubleClick = () => {
        if (t && t !== 'image') {
            setTool(t);
            setLockTool(true);
        }
    };

    return (
      <button 
        onClick={handleClick} 
        onDoubleClick={handleDoubleClick}
        className={`relative group flex items-center justify-center w-9 h-9 rounded-lg transition-all ${active ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'}`} 
        title={label || (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ') : '')}
      >
        <Icon size={18} strokeWidth={2.5} />
        {active && lockTool && t !== 'selection' && t !== 'hand' && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-violet-500 rounded-full ring-1 ring-white"></div>
        )}
      </button>
    );
  };

  return (
    <div className={`relative w-full h-full overflow-hidden ${isDarkMode ? 'bg-[#121212]' : 'bg-[#FDFDFD]'}`}>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
      
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className="block touch-none outline-none"
      />

      {/* Minimap */}
      <div className={`absolute bottom-4 right-4 z-40 transition-opacity ${showMinimap ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <canvas 
            ref={minimapRef}
            width={200}
            height={150}
            className="rounded-lg shadow-lg border border-gray-500/20 bg-white/10 backdrop-blur-sm cursor-crosshair"
            onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const y = e.clientY - rect.top;
                 // Ideally calculate center based on click and panOffset, 
                 // simple implementation here: Center map click to screen center
            }}
          />
      </div>
      
      {/* Top Toolbar */}
      <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-40">
        <div className="flex items-center p-1 gap-1 bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-200">
            <button onClick={() => setLockTool(!lockTool)} className={`p-2 rounded-lg transition-colors ${lockTool ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:bg-gray-100'}`} title="Lock Tool"><Lock size={16} /></button>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <button onClick={undo} disabled={historyIndex === 0} className={`p-2 rounded-lg transition-colors ${historyIndex === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`} title="Undo"><Undo size={16} /></button>
            <button onClick={redo} disabled={historyIndex === history.length - 1} className={`p-2 rounded-lg transition-colors ${historyIndex === history.length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`} title="Redo"><Redo size={16} /></button>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolButton t="hand" icon={Hand} isActiveOverride={effectiveTool === 'hand' && tool !== 'hand'} />
            <ToolButton t="selection" icon={MousePointer2} />
            <ToolButton t="laser" icon={Wand2} label="Laser Pointer" />
            <ToolButton t="long_position" icon={ArrowUpCircle} />
            <ToolButton t="short_position" icon={ArrowDownCircle} />
            <ToolButton t="path" icon={Waypoints} />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolButton t="rectangle" icon={Square} />
            <ToolButton t="diamond" icon={Diamond} />
            <ToolButton t="ellipse" icon={Circle} />
            <ToolButton t="arrow" icon={ArrowRight} />
            <ToolButton t="line" icon={Minus} />
            <ToolButton t="pencil" icon={Pencil} />
            <ToolButton t="text" icon={Type} />
            <ToolButton t="image" icon={ImageIcon} />
            <ToolButton t="eraser" icon={Eraser} />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <button onClick={handleSnapshot} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100" title="Export Snapshot"><Camera size={18} /></button>
        </div>
      </div>

       <div className="absolute top-6 left-6 flex flex-col gap-4 z-30">
           <div className="flex items-center gap-3">
               <button className="p-2 rounded-lg bg-white border hover:bg-gray-50 shadow-sm">
                   <div className="flex flex-col gap-[3px]">
                       <div className="w-4 h-0.5 bg-gray-600"></div>
                       <div className="w-4 h-0.5 bg-gray-600"></div>
                       <div className="w-4 h-0.5 bg-gray-600"></div>
                   </div>
               </button>
               <input 
                 value={roomTitle}
                 onChange={(e) => setRoomTitle(e.target.value)}
                 className={`font-hand font-bold text-lg hidden sm:block bg-transparent outline-none border-b border-transparent focus:border-current transition-colors ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
               />
           </div>
       </div>
       
       {/* Properties Panel (Left Side) */}
       <div className="absolute top-24 left-4 flex flex-col gap-2 z-30">
          <div className="p-3 bg-white rounded-lg shadow-md border border-gray-200 flex flex-col gap-4 w-52 max-h-[70vh] overflow-y-auto">
              
              {/* Color (Hidden when using Eraser) */}
              {tool !== 'eraser' && (
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] uppercase font-bold text-gray-400">Color</label>
                   <div className="flex gap-1 flex-wrap">
                     {['#000000', '#ffc107', '#ff8a65', '#ff5252', '#e040fb', '#448aff', '#18ffff', '#69f0ae', '#b0bec5', '#8E24AA', '#FF6F00', '#546E7A', '#00897B', '#C0CA33', '#6D4C41'].map(c => (
                         <button 
                           key={c} 
                           onClick={() => { setStrokeColor(c); updateSelectedElements({ strokeColor: c }); }} 
                           className={`w-6 h-6 rounded-[4px] border ${strokeColor === c ? 'border-gray-900 ring-1 ring-gray-900' : 'border-transparent hover:border-gray-300'}`} 
                           style={{ backgroundColor: c }} 
                         />
                     ))}
                   </div>
                </div>
              )}

              {/* Eraser Size (Visible only for Eraser) */}
              {tool === 'eraser' && (
                  <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Eraser Size</label>
                      <div className="flex items-center gap-3">
                          <input
                              type="range"
                              min="5"
                              max="100"
                              value={eraserSize}
                              onChange={(e) => setEraserSize(Number(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                          />
                          <div 
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-gray-100 shrink-0"
                          >
                               <div className="rounded-full bg-gray-400" style={{ width: Math.min(24, eraserSize/2), height: Math.min(24, eraserSize/2) }}></div>
                          </div>
                      </div>
                  </div>
              )}
              
              {/* View Controls */}
              <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase font-bold text-gray-400">View</label>
                  <div className="grid grid-cols-4 gap-2">
                     <button onClick={onToggleTheme} className="flex items-center justify-center p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-xs text-gray-700" title={isDarkMode ? 'Light Mode' : 'Dark Mode'}>
                        {isDarkMode ? <Sun size={14}/> : <Moon size={14}/>}
                     </button>
                     <button onClick={() => setShowGrid(!showGrid)} className={`flex items-center justify-center p-1.5 rounded text-xs transition-colors ${showGrid ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} title="Grid">
                        <Grid size={14}/>
                     </button>
                     <button onClick={() => setShowRuler(!showRuler)} className={`flex items-center justify-center p-1.5 rounded text-xs transition-colors ${showRuler ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} title="Ruler">
                        <RulerIcon size={14}/>
                     </button>
                     <button onClick={() => setShowMinimap(!showMinimap)} className={`flex items-center justify-center p-1.5 rounded text-xs transition-colors ${showMinimap ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`} title="Minimap">
                        <MapIcon size={14}/>
                     </button>
                  </div>
              </div>

              <div className="h-px bg-gray-200"></div>

              {/* Stroke Width (Hidden when using Eraser) */}
              {tool !== 'eraser' && (
                <>
                  <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Stroke Width</label>
                      <div className="flex gap-1">
                          {[1, 3, 5].map(w => (
                              <button 
                                key={w}
                                onClick={() => { setStrokeWidth(w); updateSelectedElements({ strokeWidth: w }); }}
                                className={`flex-1 h-8 rounded flex items-center justify-center ${strokeWidth === w ? 'bg-violet-100 text-violet-700' : 'hover:bg-gray-100 text-gray-500'}`}
                              >
                                 <div className="bg-current rounded-full" style={{ width: '16px', height: `${Math.max(2, w)}px` }}></div>
                              </button>
                          ))}
                      </div>
                  </div>

                   <div className="h-px bg-gray-200"></div>
               </>
               )}

               <div className="flex items-center gap-1">
                   <button onClick={handleCopy} disabled={selectedElementIds.length === 0} className="flex-1 p-2 text-gray-600 hover:bg-gray-100 rounded flex items-center justify-center disabled:opacity-50" title="Copy"><Copy size={16} /></button>
                   <button onClick={handlePaste} disabled={clipboard.length === 0} className="flex-1 p-2 text-gray-600 hover:bg-gray-100 rounded flex items-center justify-center disabled:opacity-50" title="Paste"><Clipboard size={16} /></button>
                   <button onClick={handleDelete} className={`flex-1 p-2 rounded flex items-center justify-center ${selectedElementIds.length > 0 ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:bg-gray-100'}`} title="Delete"><Trash2 size={16} /></button>
               </div>
          </div>
       </div>

       <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2">
           <div className="bg-white rounded-lg shadow-md border border-gray-200 flex items-center p-1">
               <button onClick={() => updateZoom(-0.1)} className="p-2 hover:bg-gray-100 rounded text-gray-600"><Minus size={16} /></button>
               <span className="text-xs font-mono font-medium text-gray-700 w-12 text-center">{Math.round(scale * 100)}%</span>
               <button onClick={() => updateZoom(0.1)} className="p-2 hover:bg-gray-100 rounded text-gray-600"><Plus size={16} /></button>
               <div className="w-px h-4 bg-gray-200 mx-1"></div>
               <button onClick={() => { setScale(1); setPanOffset({x:0,y:0}); }} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="Reset Zoom"><RotateCcw size={14} /></button>
           </div>
       </div>
    </div>
  );
});

export default AnnotationCanvas;
