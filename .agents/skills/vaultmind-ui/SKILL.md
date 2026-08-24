---
name: vaultmind-ui
description: Use when adding, changing, or reviewing VaultMind pages, layouts, forms, shadcn/ui components, chat UI, or source/document views.
---

# VaultMind UI

Build a polished product UI, not a marketing landing page. The first screen should be the usable app experience.

Keep the UI focused on sources, spaces, documents, search, and cited answers.
The optional access lock is an instance-level gate.

## Stack And Style

- Use shadcn/ui and local components before creating new primitives.
- Use `AppShell` for app pages before adding new page-level layout wrappers.
- Use `StatusToast` for async success/error notifications before adding another notification primitive.
- Use Lucide icons for icon buttons.
- Use `cn()` for class merging.
- Use named exports and kebab-case component files. Next.js route entrypoints may use required default exports.
- Keep component props explicit at boundaries.
- Do not mirror props into component state just to keep a local copy. Derive filtered
  or decorated views with `useMemo`, or keep only the minimal local override state.
- Avoid synchronous `setState` inside `useEffect`. Effects should synchronize with
  external systems; use event handlers, derived state, or a deferred one-shot effect
  with cleanup for URL callback flows that must trigger an async action.
- Keep cards for repeated items, modals, and framed tools; avoid cards inside cards.
- Avoid decorative gradients/orbs and one-note palettes.

## UX Requirements

- Knowledge base creation redirects to overview and shows a first-sync CTA.
- Do not auto-sync after creation.
- Settings should allow editing name/description and deleting the selected knowledge base with explicit confirmation.
- Disable chat send when input is empty.
- Show a no-documents state that tells the user to sync first.
- Show loading states for sync and answer generation.
- Show the latest response sources behind a compact inspector instead of a dominant panel.
- Show only the latest response sources in the current source inspector.
- Show snippets and similarity percentages in source UI, not inside generated answers.
- Keep persisted chat history visible in the sidebar across chat and bases routes.
- Support new chat, history search, rename, delete, and stable selected sessions.

## Accessibility

- Use semantic buttons, links, labels, and tables.
- Icon-only buttons need `aria-label`.
- Interactive elements need visible focus states.
- Text must fit in buttons, panels, tables, and cards across mobile and desktop widths.

## Validation Focus

Check:

- empty, loading, success, and error states
- no-documents chat state
- source panel content
- form validation messages
- mobile layout for sidebar/detail/chat views
