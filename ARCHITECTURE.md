# Collaborative Canvas: Technical Architecture

## 1. 🎨 Performance Decisions: Two-Canvas Strategy

To ensure a smooth user experience (UX) and efficient rendering, the client uses two overlaid HTML5 `<canvas>` elements:

1.  **`#base-canvas`:** The permanent layer. It holds the complete, finalized, and reconciled drawing history. It is only fully redrawn during system events like initial load or after a global undo/redo.
2.  **`#working-canvas`:** The temporary layer. It is used for **Client-Side Prediction** (drawing the user's current stroke instantly) and rendering **Remote Cursors** and other users' active, in-progress strokes. This layer is cleared frequently.

## 2. 🔄 State Synchronization and Global Undo/Redo

The server maintains an **Operation History Log** (`server/drawing-state.js`) which is the single source of truth. Each operation (stroke) is a complete object with a sequential `id` and a critical `status` flag (`APPLIED` or `UNDONE`).

### Global Undo/Redo Mechanism:

1.  **Request:** Client sends `HISTORY:UNDO`.
2.  **Server Logic:** Server searches **backwards** to find the last operation with `status: 'APPLIED'`, and changes its status to `'UNDONE'`.
3.  **Broadcast:** Server sends `HISTORY:ROLLBACK` to all clients.
4.  **Client Reconciliation:** Upon receiving `HISTORY:ROLLBACK`, the client clears its `#base-canvas` and **re-renders only the operations where `status == 'APPLIED'`** from its local history mirror. This process guarantees global state consistency.

## 3. ⚔️ Conflict Resolution

Simultaneous drawing is resolved by **strict server ordering**. The sequential `id` assigned to the operation by the server dictates the final layering (z-order) of the strokes. The first complete stroke received by the server is guaranteed to have a lower ID and will be drawn first.

## 4. 🔗 WebSocket Protocol Summary

* **Client to Server:** `DRAWING:END` (full stroke path), `CURSOR:MOVE`, `HISTORY:UNDO/REDO`.
* **Server to Client:** `DRAWING:OP` (validated operation), `STATE:UPDATE` (initial/full history), `HISTORY:ROLLBACK` (reconciliation instruction).