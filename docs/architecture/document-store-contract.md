# DocumentStore Contract

Document state, selectors, actions, and history are separate owners.

- `DocumentStore.js` is facade-only.
- `DocumentState.js` owns the canonical document state and bootstrap helpers.
- `DocumentSelectors.js` owns reads only.
- `DocumentActions.js` owns state mutations and does not touch the DOM directly.
- `DocumentHistory.js` owns undo/redo, snapshots, and view sync after history changes.
- `DS` remains the single public runtime facade for the designer.

The canonical document source of truth is `DS.state`.

