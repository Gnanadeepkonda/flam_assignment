# Real-Time Collaborative Drawing Canvas

## 📋 Overview

This project implements a multi-user drawing application using Vanilla JavaScript and WebSockets, allowing multiple users to draw simultaneously on a shared HTML5 Canvas with real-time synchronization. The architecture focuses on efficiency, state synchronization, and mastering core browser/backend technologies without external frameworks.

## ✨ Core Features Implemented

* **Real-time Synchronization:** Utilizes Socket.io for low-latency transmission of drawing segments.
* **Performance:** Implements a **Two-Canvas System** (`Base Canvas` for permanent state, `Working Canvas` for prediction/remote previews) to maintain a smooth 60 FPS user experience.
* **Global Undo/Redo:** The server maintains a strict, ordered history log of all operations, enabling any user to universally undo or redo the *last applied* action across all connected clients.
* **User Indicators:** Shows where other users are currently drawing via simple HTML/CSS cursor elements.
* **Drawing Tools:** Brush and Eraser modes, with adjustable stroke width and color.

## ⚙️ Setup and Installation

### Prerequisites

* Node.js (LTS version recommended)
* npm (comes bundled with Node.js)

### Installation Steps

1.  **Clone/Download the repository** (if applicable) or navigate to the `collaborative-canvas` directory.
2.  **Install Dependencies:** Run the following command in the project root:
    ```bash
    npm install
    ```
3.  **Start the Server:** Execute the start script:
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3000`.

## 🧪 How to Test with Multiple Users

1.  Open your browser and navigate to: `http://localhost:3000`.
2.  Open **at least one additional window** (an Incognito/Private window or a different browser, like Firefox or Edge) and navigate to the same URL.
3.  Draw in one window and observe the stroke appearing instantly in the other(s).
4.  Test the global state:
    * User A draws a line.
    * User B draws a line.
    * User A clicks the **"Undo (Global)"** button. **Both** User A's and User B's last line should disappear, proving global state control.

## 🐛 Known Limitations

* **Conflict Resolution:** Currently relies on the strict ordering of the server's operation ID (first-to-server wins). A true Operational Transformation (OT) or Conflict-free Replicated Data Type (CRDT) system is not fully implemented for concurrent segment modification, only strict ordering.
* **Persistence:** Canvas state is not saved to disk; it resets when the Node.js server is stopped and restarted.
* **Mobile Support:** Basic drawing works on touch devices, but dedicated mobile gestures (pinch-zoom, two-finger pan) are not implemented.

## ⏱️ Time Spent on the Project

* *Self-Report the total hours spent here. Be honest, e.g., "Approximately 20 hours over 4 days."*

---

## 🧠 ARCHITECTURE.md Template

```markdown
# Collaborative Canvas: Technical Architecture

This document details the critical design decisions made to address the complex challenges of real-time state synchronization, canvas rendering performance, and global history management.

## 1. 🌊 Data Flow Diagram (WebSocket Protocol)

The application uses a **Centralized State Synchronization** model. All drawing operations must be processed and validated by the server before being broadcast.

| Direction | Event Name | Purpose | Data Payload Example |
| :--- | :--- | :--- | :--- |
| **Client ➡️ Server** | `DRAWING:END` | Send final, optimized stroke path for storage. | `{ type: 'PATH', color: '#000', points: [...] }` |
| **Client ➡️ Server** | `CURSOR:MOVE` | High-frequency update for user indicators. | `{ x: 500, y: 300 }` |
| **Client ➡️ Server** | `HISTORY:UNDO` | Request server to revert the last global action. | `{}` |
| **Server ⬅️ Client** | `DRAWING:OP` | New/validated stroke added to history. | `{ id: 123, userId: 'userA', status: 'APPLIED', data: {...} }` |
| **Server ⬅️ Client** | `STATE:UPDATE` | Initial sync or full state transfer. | `{ history: [...], onlineUsers: [...] }` |
| **Server ⬅️ Client** | `HISTORY:ROLLBACK` | Instruction to re-render the canvas from history. | `{ opId: 121, action: 'UNDO' }` |

## 2. 🎨 Performance Decisions (Canvas Mastery)

### Two-Canvas Strategy

To maximize drawing responsiveness and isolate permanent state from temporary actions, a two-canvas system is used:

1.  **`#base-canvas`:** Stores the entire, reconciled drawing history. It is only redrawn completely during full state syncs (initial load, undo/redo).
2.  **`#working-canvas`:** Handles all temporary, ephemeral data, including:
    * **Client-Side Prediction:** The local user's drawing is rendered here *instantly* on `mousemove`.
    * **Remote Indicators:** Other users' cursor positions and (optionally) in-progress segments are drawn here.

This strategy ensures that the heavy redrawing only affects the small working layer during active drawing, providing a smoother UX.

### Path Optimization

The client collects points during `mousemove` but only adds a point to the path if it exceeds a minimum distance threshold (e.g., 3 pixels). The full, optimized path array is only sent once via the `DRAWING:END` event, minimizing network traffic.

## 3. 🔄 State Synchronization and Global Undo/Redo

The most complex requirement is handled via a server-maintained **Operation History Log** (`server/drawing-state.js`).

### Operation History Log

Every stroke is stored on the server as an **Operation Object** with key metadata:

```javascript
{
    id: 123,           // Strict sequential ID (for ordering)
    userId: 'userA',
    type: 'PATH',
    data: { points: [...], color: '...' },
    status: 'APPLIED'  // Key for undo/redo
}
