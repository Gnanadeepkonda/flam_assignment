// server/drawing-state.js

class DrawingState {
    constructor() {
        this.history = []; 
        this.onlineUsers = {}; 
        this.nextOperationId = 1; 
    }

    // --- Core History Management ---

    addOperation(userId, strokeData) {
        const operation = {
            id: this.nextOperationId++, 
            userId: userId,
            type: strokeData.type || 'PATH', 
            data: strokeData,
            timestamp: Date.now(),
            status: 'APPLIED', 
        };

        this.history.push(operation);
        return operation;
    }

    handleGlobalHistory(action) {
        if (action === 'UNDO') {
            for (let i = this.history.length - 1; i >= 0; i--) {
                const op = this.history[i];
                if (op.status === 'APPLIED' && op.type !== 'UNDO' && op.type !== 'REDO') { 
                    op.status = 'UNDONE'; 
                    return op; 
                }
            }
        } else if (action === 'REDO') {
            for (let i = 0; i < this.history.length; i++) {
                const op = this.history[i];
                if (op.status === 'UNDONE') {
                    op.status = 'APPLIED';
                    return op; 
                }
            }
        }
        return null;
    }

    getHistory(status = 'ALL') {
        if (status === 'APPLIED') return this.history.filter(op => op.status === 'APPLIED');
        return this.history; 
    }

    // --- User Management ---

    addUser(userId) {
        const color = this._getRandomColor();
        const user = { id: userId, color: color, name: `Guest-${userId.slice(0, 4)}` };
        this.onlineUsers[userId] = user;
        return user;
    }

    removeUser(userId) {
        delete this.onlineUsers[userId];
    }
    
    getFullState() {
        return {
            history: this.getHistory('ALL'), 
            onlineUsers: Object.values(this.onlineUsers)
        };
    }

    _getRandomColor() {
        const colors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

module.exports = { DrawingState };