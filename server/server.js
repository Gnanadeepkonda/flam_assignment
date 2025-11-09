// server/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { DrawingState } = require('./drawing-state'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const stateManager = new DrawingState(); 

const PORT = process.env.PORT || 3000;
const CANVAS_ROOM = 'canvas-room';

// 1. Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// 2. WebSocket Connection Logic
io.on('connection', (socket) => {
    const userId = socket.id;
    console.log(`\nUser connected: ${userId}`);
    
    // --- Connection and Initial Sync ---
    socket.join(CANVAS_ROOM);
    const newUser = stateManager.addUser(userId);

    socket.emit('STATE:UPDATE', stateManager.getFullState()); 
    socket.to(CANVAS_ROOM).emit('USER:JOIN', newUser);

    // --- Drawing Event Handlers ---

    socket.on('DRAWING:END', (strokeData) => {
        const validatedOp = stateManager.addOperation(userId, strokeData);
        io.to(CANVAS_ROOM).emit('DRAWING:OP', validatedOp);
    });

    socket.on('CURSOR:MOVE', (data) => {
        socket.to(CANVAS_ROOM).emit('CURSOR:UPDATE', { userId, x: data.x, y: data.y });
    });

    // --- History Management ---
    socket.on('HISTORY:UNDO', () => {
        const undoneOp = stateManager.handleGlobalHistory('UNDO');
        if (undoneOp) {
            io.to(CANVAS_ROOM).emit('HISTORY:ROLLBACK', { opId: undoneOp.id, action: 'UNDO' });
        }
    });

    socket.on('HISTORY:REDO', () => {
        const redoneOp = stateManager.handleGlobalHistory('REDO');
        if (redoneOp) {
            io.to(CANVAS_ROOM).emit('HISTORY:ROLLBACK', { opId: redoneOp.id, action: 'REDO' });
        }
    });
    
    // --- Disconnection ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        stateManager.removeUser(userId);
        io.to(CANVAS_ROOM).emit('USER:LEAVE', { userId: userId });
    });
});

// 3. Start the server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});