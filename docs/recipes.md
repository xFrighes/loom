# Loom Production Recipes & Patterns

This guide provides battle-tested, production-ready recipes and patterns for building applications with Loom. It covers common scenarios including authentication forms, asynchronous data handling, design token systems, document head metadata, internationalization, and multi-framework interoperability.

---

## Table of Contents
1. [Authentication Forms with Schema Validation](#1-authentication-forms-with-schema-validation)
2. [Asynchronous Data Fetching & Mutations](#2-asynchronous-data-fetching--mutations)
3. [Multi-Theme Design Tokens Pipeline](#3-multi-theme-design-tokens-pipeline)
4. [Document Head Metadata & SEO Management](#4-document-head-metadata--seo-management)
5. [Type-Safe Internationalization (i18n)](#5-type-safe-internationalization-i18n)
6. [Framework Interoperability & Bundler Configuration](#6-framework-interoperability--bundler-configuration)

---

## 1. Authentication Forms with Schema Validation

Authentication forms require secure data collection, reactive input state, error presentation, form submission intercepting, and validation before network dispatch.

Loom makes this elegant by combining the `- state` zone, the `@submit.prevent` event modifier, and the `- schema` zone to define validation rules.

### Component Code (`LoginForm.loom`)

```loom
- props
  onSuccess: (session: { token: string; user: { email: string } }) => void

- state
  email: string = ""
  password: string = ""
  isLoading: boolean = false
  formError: string | null = null

- schema
  credentials = z.object({
    email: z.string().email("Please enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters.")
  })

- ts
  import { credentialsSchema } from './LoginForm.loom'

  async function handleSubmit() {
    formError = null
    
    // 1. Validate form fields client-side
    const validation = credentialsSchema.safeParse({ email, password })
    if (!validation.success) {
      formError = validation.error.errors[0].message
      return
    }

    isLoading = true

    // 2. Perform network request
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Login failed')
      }

      const session = await response.json()
      onSuccess(session)
    } catch (err: any) {
      formError = err.message
    } finally {
      isLoading = false
    }
  }

- view
  form.auth-form
    ::
      max-width 420px
      margin 3rem auto
      padding 2rem
      border 1px solid var(--loom-color-border)
      border-radius 12px
      background var(--loom-color-bg-surface)
      box-shadow 0 4px 20px rgba(0, 0, 0, 0.05)
      display flex
      flex-direction column
      gap 1.5rem
    
    @submit.prevent
      handleSubmit()

    h1.title Sign In
      ::
        margin 0 0 0.5rem 0
        font-size 1.75rem
        font-weight 700
        color var(--loom-color-text-primary)
    
    if formError
      div.error-banner {formError}
        ::
          padding 0.75rem 1rem
          border-radius 6px
          background #fef2f2
          border 1px solid #fee2e2
          color #dc2626
          font-size 0.875rem
          font-weight 500

    div.field
      ::
        display flex
        flex-direction column
        gap 0.5rem

      label.label Email Address
        ::
          font-size 0.875rem
          font-weight 600
          color var(--loom-color-text-secondary)

      input.input
        :
          type email
          placeholder "you@example.com"
          bind:value email
          disabled {isLoading}
          required
        ::
          padding 0.75rem 1rem
          border 1px solid var(--loom-color-border)
          border-radius 8px
          font-size 1rem
          transition border-color 0.2s
          &:focus
            outline none
            border-color var(--loom-color-primary)

    div.field
      ::
        display flex
        flex-direction column
        gap 0.5rem

      label.label Password
        ::
          font-size 0.875rem
          font-weight 600
          color var(--loom-color-text-secondary)

      input.input
        :
          type password
          placeholder "••••••••"
          bind:value password
          disabled {isLoading}
          required
        ::
          padding 0.75rem 1rem
          border 1px solid var(--loom-color-border)
          border-radius 8px
          font-size 1rem
          transition border-color 0.2s
          &:focus
            outline none
            border-color var(--loom-color-primary)

    button.submit-btn
      :
        type submit
        disabled {isLoading}
      ::
        padding 0.875rem
        border 0
        border-radius 8px
        background var(--loom-color-primary)
        color white
        font-size 1rem
        font-weight 700
        cursor pointer
        transition filter 0.2s
        &:hover
          filter brightness(0.95)
        &:disabled
          background var(--loom-color-border)
          cursor not-allowed

      if isLoading
        span Signing in...
      else
        span Sign In
```

### Compiler Configurations

To support runtime schemas, configure the `schemaAdapter` option (e.g. `'zod'`) during compilation:

```typescript
import { compile } from '@loom-kit/compiler'

const result = compile(source, {
  componentName: 'LoginForm',
  target: 'react',
  schemaAdapter: 'zod' // Auto-injects 'zod' imports and exports the schemas
})
```

### Generated Target Outputs

Depending on the target selected, Loom compiles the state, bindings, and schema validation cleanly:

*   **React:** Emits `useState` hooks for state management and wraps computed properties/schemas. Form uses `value` + `onChange={e => setEmail(e.target.value)}`.
*   **Vue 3:** Scaffolds `<script setup>` with `ref` variables, compiling input elements to `v-model`.
*   **Svelte:** Emits standard `let` declarations with `bind:value`.

---

## 2. Asynchronous Data Fetching & Mutations

Production apps need to load async data, display loading/empty states, handle network failures, and mutate data safely. Loom handles this both server-side (for SSR) and client-side (using `onMount`).

### The React lifecycle `async` gotcha
> [!WARNING]
> React's `useEffect` hook callback cannot return a `Promise` (meaning it cannot be declared `async` directly).
> Inside the `- onMount` block, always call an inner async function or use `.then()` chains to prevent target-specific React runtime errors.

### Component Code (`UserDashboard.loom`)

```loom
- props
  userId: string

- state
  profile: any = null
  activities: any[] = []
  isLoading: boolean = true
  fetchError: string | null = null
  isSubmitting: boolean = false

- server
  // SSR Pre-fetching (e.g., in LoomKit or Next.js loader)
  export async function load(context: any) {
    const { userId } = context.params
    const res = await fetch(`https://api.example.com/users/${userId}`)
    return await res.json()
  }

- ts
  // Client-side fetch handler called on mount & manually on refresh
  async function loadClientData() {
    isLoading = true
    fetchError = null
    try {
      const res = await fetch(`/api/users/${userId}/dashboard`)
      if (!res.ok) throw new Error('Could not load profile dashboard data')
      const result = await res.json()
      profile = result.profile
      activities = result.activities
    } catch (err: any) {
      fetchError = err.message
    } finally {
      isLoading = false
    }
  }

  async function addActivity(title: string) {
    isSubmitting = true
    try {
      const res = await fetch(`/api/users/${userId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      if (!res.ok) throw new Error('Failed to record activity')
      const newActivity = await res.json()
      activities = [newActivity, ...activities] // Re-assigning triggers reactivity
    } catch (err: any) {
      alert(err.message)
    } finally {
      isSubmitting = false
    }
  }

- onMount
  // Safe client-side invocation structure avoiding direct async callback
  const init = async () => {
    await loadClientData()
  }
  init()

- view
  div.dashboard-container
    ::
      padding 2rem
      max-width 800px
      margin 0 auto
      font-family system-ui, sans-serif

    if isLoading
      div.loader Loading dashboard...
        ::
          padding 3rem
          text-align center
          color var(--loom-color-text-secondary)

    else if fetchError
      div.error-state
        ::
          padding 2rem
          text-align center
          background #fff5f5
          border-radius 8px
        h3 Error Loading Data
        p {fetchError}
        button.retry-btn Retry
          @click
            loadClientData()

    else
      div.content
        h1 Welcome back, {profile?.name}
        
        section.activity-section
          ::
            margin-top 2rem

          h2 Recent Activity
          
          div.input-group
            ::
              display flex
              gap 1rem
              margin-bottom 1.5rem
            
            button.action-btn Add Activity
              :
                disabled {isSubmitting}
              @click
                addActivity("Manual Action Triggered")
              
          if activities.length === 0
            p.empty No activity recorded yet.
          else
            ul.activity-list
              each item in activities
                li.activity-item
                  :
                    key {item.id}
                  ::
                    padding 1rem
                    border-bottom 1px solid var(--loom-color-border)
                    display flex
                    justify-content space-between
                  span {item.title}
                  span.timestamp {item.createdAt}
```

---

## 3. Multi-Theme Design Tokens Pipeline

Loom features a built-in design token compiler that transforms abstract configurations into optimized CSS Custom Properties (Variables), complete with light/dark theme variants.

### Declaring Tokens
Tokens can be declared in two places:
1.  **Locally** inside the `.loom` file via the `- tokens` zone.
2.  **Globally** via the compile options (`AdvancedCompileOptions.tokens`).

### Component Code (`ThemedCard.loom`)

```loom
- tokens
  color.primary: #4f46e5
  color.border: #e2e8f0
  color.bg-surface: #ffffff
  color.text-primary: #1e293b
  color.text-secondary: #64748b
  
  // Theme Overrides
  theme.dark.color.border: #334155
  theme.dark.color.bg-surface: #0f172a
  theme.dark.color.text-primary: #f8fafc
  theme.dark.color.text-secondary: #94a3b8

- view
  div.card
    ::
      background var(--loom-color-bg-surface)
      border 1px solid var(--loom-color-border)
      border-radius 12px
      padding 1.5rem
      transition background 0.3s, border-color 0.3s
    
    h3.title Designing with Tokens
      ::
        margin 0 0 0.5rem 0
        color var(--loom-color-text-primary)
    
    p.description Loom custom variables are compiled down to raw root and media selectors.
      ::
        margin 0
        color var(--loom-color-text-secondary)
```

### Compiled CSS Output

The compiler evaluates design tokens and outputs clean, standardized themed selectors:

```css
:root {
  --loom-color-primary: #4f46e5;
  --loom-color-border: #e2e8f0;
  --loom-color-bg-surface: #ffffff;
  --loom-color-text-primary: #1e293b;
  --loom-color-text-secondary: #64748b;
}

[data-theme="dark"] {
  --loom-color-border: #334155;
  --loom-color-bg-surface: #0f172a;
  --loom-color-text-primary: #f8fafc;
  --loom-color-text-secondary: #94a3b8;
}

@media (prefers-color-scheme: dark) {
  :root {
    --loom-color-border: #334155;
    --loom-color-bg-surface: #0f172a;
    --loom-color-text-primary: #f8fafc;
    --loom-color-text-secondary: #94a3b8;
  }
}
```

---

## 4. Document Head Metadata & SEO Management

Search engine optimization and link previews rely on tags in the document `<head>`. Loom provides a unified `- meta` zone to define titles and metadata, compiling to framework-native configurations.

### Component Code (`ProductDetail.loom`)

```loom
- meta
  title: Premium Noise-Cancelling Headphones
  description: Industry-leading sound quality with smart noise-cancelling technology.
  og:title: Premium Headphones | AudioStore
  og:description: Discover high-fidelity audio today.
  og:image: https://audiostore.com/assets/headphones-og.jpg
  twitter:card: summary_large_image

- props
  price: string

- view
  div.product-page
    h1 Noise-Cancelling Headphones
    p Pricing starts at {price}
```

### Target Codegen Parity

*   **React:** Emits an exported `loomMeta` constant and a helper `Head()` component which can be rendered in router/meta configurations (e.g., Next.js / React Router).
    ```typescript
    export const loomMeta = {
      "title": "Premium Noise-Cancelling Headphones",
      "description": "Industry-leading sound quality with smart noise-cancelling technology.",
      "og:title": "Premium Headphones | AudioStore"
    };

    export function Head() {
      return (
        <>
          <title>{"Premium Noise-Cancelling Headphones"}</title>
          <meta name="description" content="Industry-leading sound quality with smart noise-cancelling technology." />
          <meta property="og:title" content="Premium Headphones | AudioStore" />
        </>
      )
    }
    ```
*   **Vue 3:** Emits a setup variable `const __loomHead = { ... }` that integrates automatically with SSR modules and head managers like `@unhead/vue`.
*   **Svelte:** Injects a native Svelte header injection block:
    ```html
    <svelte:head>
      <title>Premium Noise-Cancelling Headphones</title>
      <meta name="description" content="Industry-leading sound quality with smart noise-cancelling technology." />
      <meta property="og:title" content="Premium Headphones | AudioStore" />
    </svelte:head>
    ```

---

## 5. Type-Safe Internationalization (i18n)

Loom includes built-in i18n key extraction and missing-key static validation. It detects keys embedded in three distinct styles:

1.  **Function Call:** `{t('namespace.key')}`
2.  **Namespace Directive Prefix:** `i18n:namespace.key`
3.  **Double Curly Interpolation:** `{{namespace.key}}`

### Component Code (`SettingSelector.loom`)

```loom
- props
  currentLocale: string

- view
  section.settings
    // Pattern 1: Standard function translation
    h2 {t('settings.title')}
    
    // Pattern 2: Namespace directive
    p
      :
        title i18n:settings.tooltip
      span {t('settings.description')}
      
    // Pattern 3: Template interpolation syntax
    button.save-btn
      span {{settings.actions.save}}
```

### Compiler Static Validation

If compile options include i18n dictionary configurations, Loom compares extracted keys against standard translations and emits warnings for missing entries.

```typescript
import { compile } from '@loom-kit/compiler'

const result = compile(source, {
  componentName: 'SettingSelector',
  target: 'react',
  i18n: {
    messages: {
      'settings.title': 'Application Settings',
      'settings.description': 'Manage preferences.'
      // Missing 'settings.tooltip' and 'settings.actions.save'
    }
  }
})

console.log(result.warnings)
// Output contains compiler diagnostics detailing missing translation keys:
// [ { code: 'loom/i18n-missing-key', message: 'Missing i18n key "settings.tooltip".' }, ... ]
```

---

## 6. Framework Interoperability & Bundler Configuration

Because Loom compiles to React TSX, Vue SFCs, or Svelte files, integrating `.loom` files into an existing monorepo is seamless.

### Vite Integration (`vite.config.ts`)

Install and configure `vite-plugin-loom` in your build environment. Define which framework target to emit:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vitePluginLoom } from 'vite-plugin-loom'

export default defineConfig({
  plugins: [
    react(),
    vitePluginLoom({
      target: 'react', // Change to 'vue' or 'svelte' as needed
      schemaAdapter: 'zod',
      extractCss: true
    })
  ]
})
```

### TypeScript Ambient Module Types (`vite-env.d.ts`)

Create a declaration file so the TypeScript compiler resolves imported `.loom` files as valid components:

```typescript
declare module '*.loom' {
  // Target: react
  import React from 'react'
  const component: React.ComponentType<any>
  export default component
}
```
*(If targeting Vue, declare it returning `DefineComponent<{}, {}, any>`; if Svelte, return `ComponentType<SvelteComponent>`.)*

### Interop Patterns: Consuming Loom inside Framework Code

Loom components compile to standard, standard-compliant framework components. You can import them directly without wrappers:

#### In a React Host:
```tsx
import React, { useState } from 'react'
import LoginForm from './components/LoginForm.loom'

export function App() {
  const [user, setUser] = useState<any>(null)
  
  return (
    <div className="app">
      {!user ? (
        <LoginForm onSuccess={(session) => setUser(session.user)} />
      ) : (
        <h1>Welcome, {user.email}</h1>
      )}
    </div>
  )
}
```

#### In a Vue Host:
```html
<script setup lang="ts">
import { ref } from 'vue'
import LoginForm from './components/LoginForm.loom'

const user = ref<any>(null)
function handleSuccess(session: any) {
  user.value = session.user
}
</script>

<template>
  <div class="app">
    <LoginForm v-if="!user" @success="handleSuccess" />
    <h1 v-else>Welcome, {{ user.email }}</h1>
  </div>
</template>
```
