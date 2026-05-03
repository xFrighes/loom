# Loom Reactivity Model Specification (Draft)

This proposal outlines a framework-neutral reactivity model for Loom, allowing developers to express state, derived values, and lifecycle hooks without depending on framework-specific APIs like React's `useState` or Vue's `ref`.

## 1. Reactive State (`- state`)

The `- state` zone declares mutable reactive variables.

```loom
- state
  count: number = 0
  items: string[] = []
```

### Syntax

- `name: type [= defaultValue]`
- Variables declared here are mutable within the component's logic.

---

## 2. Derived Values (`- computed`)

The `- computed` zone declares values that are automatically re-calculated when their dependencies (props or state) change.

```loom
- computed
  doubleCount = count * 2
  hasItems = items.length > 0
```

### Syntax

- `name = expression`
- The compiler automatically detects dependencies by analyzing the expression.

---

## 3. Lifecycle Hooks (`- onMount`, `- onUpdate`, `- onUnmount`)

Instead of a generic `- ts` block for everything, Loom provides specific zones for lifecycle logic.

```loom
- onMount
  console.log("Component mounted")
  const timer = setInterval(() => count++, 1000)

  return () => {
    clearInterval(timer)
    console.log("Cleanup on unmount")
  }
```

---

## 4. Lowering (Compilation Targets)

### React Target

- `- state` → `useState` hooks.
- `- computed` → `useMemo` hooks with dependency arrays.
- `- onMount` → `useEffect` with an empty dependency array.
- **Assignment Transformation**: The compiler transforms assignments to state variables (e.g., `count++`) into setter calls (e.g., `setCount(prev => prev + 1)`).

### Vue Target

- `- state` → `ref()` declarations.
- `- computed` → `computed()` declarations.
- `- onMount` → `onMounted` hook.
- **Value Access**: The compiler automatically appends `.value` when accessing state/computed variables in the `<script setup>` block.

### Svelte Target

- `- state` → `let` declarations.
- `- computed` → `$: name = expression` reactive declarations.
- `- onMount` → `onMount` from `'svelte'`.

---

## 5. Benefits

- **Portability**: Components can be compiled to any target without changing logic.
- **Conciseness**: Avoids boilerplate like `useState`, `setX`, `.value`, and dependency arrays.
- **Safety**: The compiler can validate state mutations and dependency tracking at build time.
