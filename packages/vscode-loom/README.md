# 🧵 Loom for Visual Studio Code

Bring the power of **Loom**—the framework-agnostic UI language—directly into your editor. This extension provides robust language support, syntax highlighting, formatting, live previews, and automated conversion tools to streamline writing reusable Loom components.

Learn more about the Loom language at the [official repository](https://github.com/xFrighes/loom).

---

## ✨ Features

- 🎨 **Syntax Highlighting:** Full semantic coloring for Loom files (`.loom`), including dedicated styles for Data, Style, and Behavior zones.
- ⚡ **Live Previews:** Instant side-by-side preview of compiled components in your target framework (React, Vue, or Svelte).
- 🧩 **Smart Snippets:** Quick-insert structures for zones (`- props`, `- state`, `- computed`, `- watch`), conditionals (`if`/`else`), loops, and tags.
- 📋 **HTML/JSX Conversion Tools:**
  - **Paste Clipboard as HTML:** Quickly convert copied HTML into clean Loom templates.
  - **Paste Clipboard as JSX:** Convert React JSX straight into Loom.
  - **Convert Selection from HTML:** Refactor selected HTML blocks into Loom with a single command.
- 🛠️ **Language Server Integration:** Diagnostics, error reporting, hovers, formatting, and auto-completions powered by the Rust-based Loom Language Server.

---

## 🚀 Getting Started

1. **Install the Extension** from the VS Code Marketplace.
2. **Open a `.loom` file** to automatically activate the extension.
3. Use the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to explore Loom commands.

---

## ⌨️ Extension Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `loom.preview` | **Loom: Open Preview** | Opens a real-time preview of the current Loom file. |
| `loom.pasteAsLoomHtml` | **Loom: Paste Clipboard as HTML** | Converts HTML in your clipboard into Loom format. |
| `loom.pasteAsLoomJsx` | **Loom: Paste Clipboard as JSX** | Converts JSX in your clipboard into Loom format. |
| `loom.convertSelectionToLoomHtml` | **Loom: Convert Selection from HTML** | Converts the selected HTML text to Loom. |
| `loom.restartLanguageServer` | **Loom: Restart Language Server** | Restarts the background LSP server. |

---

## ⚙️ Configuration Settings

You can customize the extension via your VS Code Settings:

* `loom.preview.target`: Choose the compilation target used for previews. Options: `react` (default), `vue`, or `svelte`.
* `loom.languageServer.path`: Custom path to the `loom-language-server` executable.
* `loom.compiler.path`: Custom path to the `loomc` compiler executable.
* `loom.codemod.path`: Custom path to the `loom-codemod` executable.

---

## 🎨 The "Loom Way" (Example Component)

```loom
- props
  title: string
  initialCount: number = 0

- state
  count: number = initialCount

- computed
  isBig = count > 10

- view
  div.counter-card
    ::
      padding: 1.5rem;
      border: 1px solid {isBig ? 'red' : '#ddd'};
      border-radius: 8px;

    h2 {title}
    
    button
      @click
      count++
      + Increment
    
    span Current count: {count}
    
    if isBig
      p.warning THAT IS A BIG NUMBER!
```

---

## 🛡️ License

Loom and this extension are licensed under the [MIT License](LICENSE).
