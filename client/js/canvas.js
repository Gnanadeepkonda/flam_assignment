// client/js/canvas.js

import { sendCursorMove, sendDrawingEnd } from './websocket.js';
// throttle is defined in main.js, imported here
let sendCursorMoveThrottled; 

class CanvasApp {
    constructor(baseCanvasId, workingCanvasId, userId, throttleFn) {
        this.baseCanvas = document.getElementById(baseCanvasId);
        this.workingCanvas = document.getElementById(workingCanvasId);
        this.baseCtx = this.baseCanvas.getContext('2d');
        this.workingCtx = this.workingCanvas.getContext('2d');
        
        this.userId = userId;
        this.operationHistory = [];
        this.isDrawing = false;
        this.localStroke = null;
        
        // --- NEW: Tool State Management ---
        this.currentMode = 'DRAW'; // 'DRAW', 'ERASER', 'SHAPE', 'FILL'
        this.shapeType = null;     // 'LINE', 'RECTANGLE', 'CIRCLE'
        // ---------------------------------
        
        this.currentStrokeData = {
            color: document.getElementById('stroke-color').value,
            width: parseInt(document.getElementById('stroke-width').value),
            type: 'PATH'
        };
        
        this.remoteCursors = {}; 
        this.onlineUsers = {}; 
        sendCursorMoveThrottled = throttleFn(sendCursorMove, 50);

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.initEventListeners();
    }
    
    // --- Tool Management Helper ---
    setActiveTool(mode, shapeType = null) {
        this.currentMode = mode;
        this.shapeType = shapeType;
        
        // UI: Manage active button states
        document.querySelectorAll('#controls button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Set 'active' class for the currently selected tool/shape
        if (mode === 'SHAPE' && shapeType) {
            document.getElementById(`${shapeType.toLowerCase().split(' ')[0]}-btn`).classList.add('active');
        } else if (mode === 'DRAW') {
            document.getElementById('draw-btn').classList.add('active');
        } else if (mode === 'ERASER') {
            document.getElementById('erase-btn').classList.add('active');
        } else if (mode === 'FILL') {
            document.getElementById('fill-btn').classList.add('active');
        }
    }

    // --- Event Listeners and Tool Switching ---
    initEventListeners() {
        this.workingCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.workingCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.workingCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.workingCanvas.addEventListener('mouseout', this.handleMouseUp.bind(this));

        document.getElementById('stroke-width').addEventListener('change', (e) => this.currentStrokeData.width = parseInt(e.target.value));
        document.getElementById('stroke-color').addEventListener('change', (e) => this.currentStrokeData.color = e.target.value);
        
        // Tool Mode Listeners (Draw, Eraser, Fill)
        document.getElementById('draw-btn').addEventListener('click', () => this.setActiveTool('DRAW'));
        document.getElementById('erase-btn').addEventListener('click', () => this.setActiveTool('ERASER'));
        document.getElementById('fill-btn').addEventListener('click', this.handleFillAction.bind(this)); 
        
        // Shape Mode Listeners (Line, Rectangle, Circle)
        document.getElementById('line-btn').addEventListener('click', () => this.setActiveTool('SHAPE', 'LINE'));
        document.getElementById('rect-btn').addEventListener('click', () => this.setActiveTool('SHAPE', 'RECTANGLE'));
        document.getElementById('circle-btn').addEventListener('click', () => this.setActiveTool('SHAPE', 'CIRCLE'));

        // Set default active tool
        this.setActiveTool('DRAW');
    }

    // --- Canvas Setup ---
    resizeCanvas() {
        this.baseCanvas.width = this.workingCanvas.width = window.innerWidth;
        this.baseCanvas.height = this.workingCanvas.height = window.innerHeight;
        this.redrawFullHistory(); 
        this.clearWorkingCanvas(); 
    }
    
    // --- Mouse Handlers (UPDATED for Modes) ---
    handleMouseDown(e) {
        const x = e.offsetX;
        const y = e.offsetY;

        if (this.currentMode === 'FILL') return; 
        
        this.isDrawing = true;
        
        if (this.currentMode === 'SHAPE') {
            this.localStroke = { 
                type: this.shapeType, 
                color: this.currentStrokeData.color,
                width: this.currentStrokeData.width,
                startX: x, 
                startY: y,
                endX: x, 
                endY: y 
            };
        } else { // 'DRAW' or 'ERASER'
            this.localStroke = { 
                type: this.currentMode === 'ERASER' ? 'ERASER' : 'PATH', 
                color: this.currentStrokeData.color,
                width: this.currentStrokeData.width,
                points: [{ x, y }] 
            };
            this.drawStroke(this.workingCtx, this.localStroke, this.localStroke.type === 'ERASER');
        }
    }

    handleMouseMove(e) {
        const x = e.offsetX;
        const y = e.offsetY;

        sendCursorMoveThrottled({ x, y });

        if (!this.isDrawing || this.currentMode === 'FILL') return;

        if (this.currentMode === 'SHAPE') {
            // Update and redraw shape prediction on working canvas
            this.localStroke.endX = x;
            this.localStroke.endY = y;
            
            this.clearWorkingCanvas(); 
            this.drawShape(this.workingCtx, this.localStroke, false);
            
        } else { // 'DRAW' or 'ERASER'
            const lastPoint = this.localStroke.points[this.localStroke.points.length - 1];
            
            if (Math.hypot(x - lastPoint.x, y - lastPoint.y) > 3) {
                this.localStroke.points.push({ x, y });
                this.drawSegment(this.workingCtx, lastPoint, { x, y }, this.localStroke, this.localStroke.type === 'ERASER');
            }
        }
    }

    handleMouseUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.currentMode === 'SHAPE') {
            this.localStroke.endX = e.offsetX;
            this.localStroke.endY = e.offsetY;
            sendDrawingEnd(this.localStroke); 
            this.setActiveTool('DRAW'); // Switch back to drawing mode
            
        } else if (this.localStroke && this.localStroke.points.length > 1) { 
            sendDrawingEnd(this.localStroke); 
        }

        this.localStroke = null;
        this.clearWorkingCanvas();
    }
    
    // --- NEW: Fill Action Handler ---
    handleFillAction() {
        // Prepare FILL operation data
        const fillData = {
            type: 'FILL',
            color: this.currentStrokeData.color
        };
        
        // 1. Apply Fill locally to the BASE canvas immediately (Prediction)
        this.handleFullFillRender(this.baseCtx, fillData);
        
        // 2. Add a temporary local op (ID -1) before sending
        this.operationHistory.push({
            id: -1, 
            userId: this.userId,
            type: 'FILL',
            data: fillData,
            status: 'APPLIED',
        });
        
        // 3. Send the operation to the server
        sendDrawingEnd(fillData); 
        this.setActiveTool('DRAW');
    }

    // --- State Synchronization ---
    loadHistory(history, users) {
        this.operationHistory = history;
        this.onlineUsers = users.reduce((acc, user) => { acc[user.id] = user; return acc; }, {});
        this.redrawFullHistory();
    }
    
    applyRemoteOperation(op) {
        // Remove temporary local op if it exists (like the -1 ID fill op)
        const existingIndex = this.operationHistory.findIndex(o => o.id === op.id);
        if (existingIndex === -1) {
            this.operationHistory = this.operationHistory.filter(o => o.id !== -1);
            this.operationHistory.push(op);
        } else {
            this.operationHistory[existingIndex] = op;
        }

        if (op.status === 'APPLIED') {
            const data = op.data;
            if (data.type === 'PATH' || data.type === 'ERASER') {
                this.drawStroke(this.baseCtx, data, data.type === 'ERASER');
            } else if (data.type === 'RECTANGLE' || data.type === 'LINE' || data.type === 'CIRCLE') {
                this.drawShape(this.baseCtx, data, false);
            } else if (data.type === 'FILL') {
                this.handleFullFillRender(this.baseCtx, data);
            }
        }
        
        this.clearWorkingCanvas(); 
    }
    
    handleRollback(opId, action) {
        const modifiedOp = this.operationHistory.find(op => op.id === opId);
        if (modifiedOp) {
            modifiedOp.status = (action === 'UNDO') ? 'UNDONE' : 'APPLIED';
        }
        this.redrawFullHistory();
    }

    // --- Rendering Helpers (UPDATED for Shapes and Fill) ---

    drawStroke(ctx, strokeData, isEraser = false) {
        ctx.beginPath();
        
        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)'; 
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = strokeData.color;
        }

        ctx.lineWidth = strokeData.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const points = strokeData.points;
        if (points && points.length > 0) {
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
        }
        ctx.stroke();
        
        if (isEraser) {
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    
    drawSegment(ctx, p1, p2, strokeData, isEraser = false) {
        ctx.beginPath();
        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)'; 
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = strokeData.color;
        }
        ctx.lineWidth = strokeData.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (isEraser) {
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    drawShape(ctx, shapeData, isFill = false) {
        ctx.beginPath();
        
        ctx.strokeStyle = shapeData.color;
        ctx.lineWidth = shapeData.width;
        ctx.lineJoin = 'miter'; 
        ctx.globalCompositeOperation = 'source-over';

        const w = shapeData.endX - shapeData.startX;
        const h = shapeData.endY - shapeData.startY;

        if (shapeData.type === 'LINE') {
            ctx.moveTo(shapeData.startX, shapeData.startY);
            ctx.lineTo(shapeData.endX, shapeData.endY);
            ctx.stroke();
            
        } else if (shapeData.type === 'RECTANGLE') {
            if (isFill) {
                ctx.fillStyle = shapeData.color;
                ctx.fillRect(shapeData.startX, shapeData.startY, w, h);
            } else {
                ctx.strokeRect(shapeData.startX, shapeData.startY, w, h);
            }
        } else if (shapeData.type === 'CIRCLE') {
            // Ellipse/Circle calculation
            const radiusX = Math.abs(w) / 2;
            const radiusY = Math.abs(h) / 2;
            const centerX = shapeData.startX + w / 2;
            const centerY = shapeData.startY + h / 2;
            
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            
            if (isFill) {
                ctx.fillStyle = shapeData.color;
                ctx.fill();
            } else {
                ctx.stroke();
            }
        }
    }
    
    handleFullFillRender(ctx, fillData) {
        // Fills must clear previous content to ensure true fill
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        ctx.fillStyle = fillData.color;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    redrawFullHistory() {
        this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        
        const appliedOps = this.operationHistory
            .filter(op => op.status === 'APPLIED')
            .sort((a, b) => a.id - b.id); 

        appliedOps.forEach(op => {
            const data = op.data;
            if (data.type === 'PATH' || data.type === 'ERASER') {
                this.drawStroke(this.baseCtx, data, data.type === 'ERASER');
            } else if (data.type === 'RECTANGLE' || data.type === 'LINE' || data.type === 'CIRCLE') {
                this.drawShape(this.baseCtx, data, false);
            } else if (data.type === 'FILL') {
                this.handleFullFillRender(this.baseCtx, data); 
            }
        });
    }

    clearWorkingCanvas() {
        this.workingCtx.clearRect(0, 0, this.workingCanvas.width, this.workingCanvas.height);
    }
    
    // --- User Management and Cursor Drawing (DOM) ---
    updateRemoteCursor(userId, x, y) {
        let cursor = this.remoteCursors[userId];
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.classList.add('remote-cursor');
            cursor.style.backgroundColor = this.onlineUsers[userId]?.color || 'gray';
            document.body.appendChild(cursor);
            this.remoteCursors[userId] = cursor;
        }
        cursor.style.transform = `translate(${x - 5}px, ${y - 5}px)`;
    }

    removeUser(userId) {
        if (this.remoteCursors[userId]) {
            this.remoteCursors[userId].remove();
            delete this.remoteCursors[userId];
        }
        delete this.onlineUsers[userId];
    }
    
    addUser(user) {
        this.onlineUsers[user.id] = user;
    }
}

export { CanvasApp };