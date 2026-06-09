# LoomKit Architecture Specification

## Status

Draft

## Summary

LoomKit is the official meta-framework for Loom, providing file-system-based routing, universal Server-Side Rendering (SSR), and a unified development experience across React, Vue, and Svelte targets. It leverages Vite's SSR APIs to provide a high-performance, modular foundation for building full-stack applications with `.loom` components.

## Goals

- Provide a standard, file-system-based routing convention.
- Support universal SSR (Server-Side Rendering) for all supported Loom targets.
- Enable seamless data fetching and state management across server and client.
- Leverage Vite for fast development and optimized production builds.
- Support layouts, error boundaries, and loading states.
- Maintain framework-agnostic core logic where possible.

## Core Concepts

### 1. File-System-Based Routing

LoomKit uses the `src/routes` directory to define the application's routing structure.

- `src/routes/page.loom`: Defines a page at the corresponding URL path.
- `src/routes/layout.loom`: Defines a layout that wraps all pages and sub-layouts in its directory.
- `src/routes/error.loom`: Defines an error boundary for the current route segment.
- `src/routes/loading.loom`: Defines a loading UI for the current route segment.
- `src/routes/+server.ts`: Defines API routes (GET, POST, etc.) for a path.

#### Example Directory Structure:

```text
src/routes/
  layout.loom          // Root layout
  page.loom            // Home page (/)
  about/
    page.loom          // About page (/about)
  blog/
    layout.loom        // Blog layout
    [slug]/
      page.loom        // Blog post page (/blog/my-post)
  api/
    hello/
      +server.ts       // API endpoint (/api/hello)
```

### 2. Universal SSR

LoomKit performs SSR by rendering `.loom` components on the server and hydrating them on the client.

- **Server Rendering:** The server executes the component's logic and generates the initial HTML.
- **Hydration:** The client receives the HTML and "wakes up" the component, attaching event listeners and synchronizing state.
- **Target Agnosticism:** LoomKit abstracts the SSR implementation for React, Vue, and Svelte, allowing the same `.loom` file to be rendered by any of the three engines.

### 3. Data Fetching

LoomKit introduces a standard way to fetch data for pages and layouts using `load` functions.

- `page.ts` / `layout.ts`: Adjacent to `.loom` files, these files can export a `load` function.
- The `load` function runs on the server (and optionally on the client during SPA navigation).
- The returned data is passed as props to the corresponding `.loom` component.

```typescript
// src/routes/blog/[slug]/page.ts
import type { PageLoad } from '@loom-kit/kit'

export const load: PageLoad = async ({ params }) => {
  const post = await db.getPost(params.slug)
  return { post }
}
```

### 4. Vite Integration

LoomKit is built on top of Vite and utilizes its SSR capabilities.

- **`vite-plugin-loom`:** The core plugin for compiling `.loom` files.
- **`@loom-kit/kit/vite`:** A Vite plugin that handles routing and SSR orchestration.
- **Development Server:** Uses Vite's HMR and SSR middleware for a fast dev loop.
- **Production Build:** Generates optimized client and server bundles.

## Technical Architecture

### Routing Engine

The routing engine scans the `src/routes` directory and generates a route manifest. This manifest is used by both the server and the client to match URLs to component trees.

### SSR Orchestration

1. **Request:** A request arrives at the server.
2. **Match:** The router matches the URL to a set of layouts and a page.
3. **Load:** The `load` functions for the matched layouts and page are executed (sequentially or in parallel).
4. **Render:** The framework-specific renderer (React, Vue, or Svelte) is invoked to generate the HTML string.
5. **Inject:** The generated HTML and the fetched data (serialized as JSON) are injected into the base HTML template.
6. **Response:** The complete HTML document is sent to the client.

### Client-Side Navigation

After the initial page load, LoomKit takes over as a Single Page Application (SPA).

1. **Intercept:** Link clicks are intercepted.
2. **Fetch:** The `load` function for the new route is executed (fetching data via a small JSON request if the `load` function only runs on the server).
3. **Render:** The new page component is rendered on the client.
4. **Update:** The URL is updated via the History API.

## API Routes (`+server.ts`)

API routes allow defining server-side logic without a corresponding UI. They are handled by a dedicated middleware.

```typescript
// src/routes/api/hello/+server.ts
import { json } from '@loom-kit/kit'

export const GET = async () => {
  return json({ message: 'Hello from LoomKit!' })
}
```

## Error Handling and Transitions

- **Error Boundaries:** `error.loom` files catch errors in their route segment and display a fallback UI.
- **Loading States:** `loading.loom` files are displayed while `load` functions are pending during client-side navigation.

## Future Considerations

- Middleware support for authentication and redirects.
- Static Site Generation (SSG) support.
- Incremental Static Regeneration (ISR) support.
- Advanced caching strategies for `load` functions.
- Integration with popular deployment platforms (Vercel, Netlify, etc.).
