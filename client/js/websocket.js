// client/js/websocket.js

const socket = io(); 
let canvasApp = null;

export function initWebSocket(appInstance) {
    canvasApp = appInstance;
    
    // --- Incoming Messages ---
    socket.on('STATE:UPDATE', (state) => {
        canvasApp.loadHistory(state.history, state.onlineUsers);
    });
    
    socket.on('DRAWING:OP', (operation) => {
        canvasApp.applyRemoteOperation(operation); 
    });
    
    socket.on('HISTORY:ROLLBACK', ({ opId, action }) => {
        canvasApp.handleRollback(opId, action); 
    });

    socket.on('CURSOR:UPDATE', (data) => {
        canvasApp.updateRemoteCursor(data.userId, data.x, data.y);
    });
    
    socket.on('USER:JOIN', (user) => canvasApp.addUser(user));
    socket.on('USER:LEAVE', ({ userId }) => canvasApp.removeUser(userId));
}

// --- Outgoing Messages ---

export const sendDrawingEnd = (strokeData) => {
    socket.emit('DRAWING:END', strokeData);
};

export const sendCursorMove = (data) => {
    socket.emit('CURSOR:MOVE', data);
};

export const requestUndo = () => {
    socket.emit('HISTORY:UNDO');
};

export const requestRedo = () => {
    socket.emit('HISTORY:REDO');
};

export const getMyUserId = () => socket.id;