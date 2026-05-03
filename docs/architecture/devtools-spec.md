# Loom DevTools Architecture Plan

## Status

Draft

## Summary

Loom DevTools is a browser extension designed to help developers inspect and debug Loom applications. It provides a unified view of the original `.loom` component tree, including props and state, regardless of whether the application is rendered using React, Vue, or Svelte.

## Goals

- Inspect the original `.loom` component tree, not just the rendered DOM or framework-specific internal structures.
- View and modify component props and state in real-time.
- Trace component updates and performance.
- Provide a consistent debugging experience across React, Vue, and Svelte.
- Minimal overhead in production builds.

## Architecture

### 1. Global Hook Injection

Loom DevTools will inject a global hook (e.g., `__LOOM_DEVTOOLS_GLOBAL_HOOK__`) into the page as early as possible. This hook serves as the communication bridge between the Loom application and the extension's panel.

```javascript
// Injected script
window.__LOOM_DEVTOOLS_GLOBAL_HOOK__ = {
  version: '1.0.0',
  components: new Map(),
  emit: function (event, payload) {
    window.postMessage({ source: 'loom-devtools-hook', event, payload }, '*')
  },
  on: function (event, handler) {
    // Register listeners for events from the panel
  },
}
```

### 2. Compiler & Plugin Support

To enable inspection, the Loom compiler and Vite plugin must include additional metadata in the compiled output when in development mode.

- **`ComponentMetadata`:** Each compiled component will include information about its original `.loom` file path and structural metadata.
- **Node IDs:** Each element and component instance in the `.loom` file will be assigned a unique ID to facilitate mapping back to the original source.

### 3. Framework Adapters

Loom DevTools uses framework-specific adapters to bridge the gap between the underlying engine (React/Vue/Svelte) and the Loom-specific view.

- **React Adapter:** Hooks into React's fiber tree to extract Loom-relevant data.
- **Vue Adapter:** Utilizes Vue's `devtools` API or internal component instance properties.
- **Svelte Adapter:** Leverages Svelte's `svelte/internal` APIs and component lifecycle hooks.

Adapters are responsible for:

- Mapping internal framework instances to Loom component IDs.
- Extracting props and state values.
- Listening for component updates.

### 4. Communication Protocol

The extension consists of three main parts:

- **Injected Hook:** Lives in the page's execution context.
- **Content Script:** Relays messages between the hook and the background script.
- **DevTools Panel:** The UI where the developer interacts with the component tree.

Messages are exchanged using `window.postMessage` and browser-specific extension APIs (`chrome.runtime.sendMessage`, etc.).

### 5. Features

#### Component Tree Explorer

A hierarchical view of all Loom components currently rendered on the page. Selecting a component highlights it in the DOM and displays its details in the side panel.

#### Props and State Inspector

A searchable and editable view of the selected component's props and state. Changes made in the inspector are synchronized back to the application in real-time.

#### Source Mapping

A "Jump to Source" feature that opens the original `.loom` file in the developer's IDE (via an editor integration like `open-in-editor`).

#### Performance Profiler

A tool to visualize component render times and identify performance bottlenecks.

## Security and Production

- DevTools integration is only enabled in development mode.
- Production builds will strip out the metadata and adapters to minimize bundle size and prevent accidental exposure of internal application state.

## Future Considerations

- Support for inspecting remote devices (e.g., mobile browsers).
- Integration with Loom's language server for enhanced code-to-component mapping.
- Custom plugins or hooks for third-party Loom libraries.
