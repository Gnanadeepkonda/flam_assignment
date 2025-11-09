// client/js/main.js

import { initWebSocket, getMyUserId, requestUndo, requestRedo } from './websocket.js';
import { CanvasApp } from './canvas.js';

// Simple utility function to limit the rate of function calls
export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function initializeApp() {
    const myUserId = getMyUserId();
    
    // Initialize Canvas Application, passing the throttle function
    const canvasApp = new CanvasApp('base-canvas', 'working-canvas', myUserId, throttle);
    
    // Initialize WebSocket communication
    initWebSocket(canvasApp);
    
    // Connect UI events to WebSocket actions
    document.getElementById('undo-btn').addEventListener('click', requestUndo);
    document.getElementById('redo-btn').addEventListener('click', requestRedo);

    console.log('App initialized. User ID:', myUserId);
}

document.addEventListener('DOMContentLoaded', initializeApp);