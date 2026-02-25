# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PinBridge Web is a PWA for transferring saved places between Apple Maps and Google Maps. It's a local-first application that stores data in IndexedDB, requiring no backend for core functionality.

**Key principle:** Migration + backup, not automatic sync. Users must manually save places in the target app.

## Quick Rules

### What you can do without asking
- Edit files only under: `src/`
- Prefer small, incremental changes with tests after each step

### Commands you should use
- Install: `bun install`
- Test: `bun test` (Jest)
- Lint: `bun lint`
- Typecheck: `bun run type-check`

### Safety
- Never run destructive commands (`rm -rf`, disk tools, `git reset --hard`, `git clean -f`)
- If something requires network access or secrets, stop and ask

## Commands

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Build for production
bun build

# Run production build
bun start

# Lint code
bun lint

# Type check
bun run type-check
```

## Architecture

### Data Layer (Local-First)
- **IndexedDB via Dexie** (`src/lib/db/index.ts`): All data persisted locally
- Tables: `places`, `collections`, `placeCollections`, `transferPacks`, `transferPackItems`, `importRuns`
- Zustand stores (`src/stores/`) wrap Dexie for React integration

### Core Data Flow
1. **Import** → Parse files/URLs → Normalize → Dedupe check → Store in IndexedDB
2. **Library** → Query/filter places → Display with live updates (useLiveQuery)
3. **Transfer Pack** → Snapshot place IDs → Track progress per item → Persist status

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/lib/db/` | Dexie database schema and helpers |
| `src/lib/parsers/` | Google Takeout ZIP, CSV, URL parsers |
| `src/lib/links/` | Apple/Google Maps URL generation and parsing |
| `src/stores/` | Zustand state management |
| `src/types/` | TypeScript interfaces |

### Link Generation Strategy
- **With coordinates:** Use `ll=lat,lng` (Apple) or `query=lat,lng` (Google)
- **Without coordinates:** Fall back to address/title query (less accurate)
- Always preserve `sourceUrl` for reference

### Deduplication
- Normalize title/address (lowercase, remove punctuation, collapse whitespace)
- Check for exact normalized match OR coordinate proximity (<100m)

## Routes

| Route | Component |
|-------|-----------|
| `/` | Library (all places) |
| `/import` | Import hub (Takeout, CSV, paste link) |
| `/collections/:id` | Collection detail |
| `/place/:id` | Place detail with open-in links |
| `/resolve` | Batch coordinate resolver |
| `/transfer-packs` | Transfer packs list |
| `/transfer-packs/new` | Create transfer pack wizard |
| `/transfer-packs/:id/run` | Run transfer pack (open next flow) |
| `/export` | Export options |
| `/settings` | Data management |

## Important Patterns

### Import Flow
```
File Upload → Worker Parse → Progress UI → Import Report → Library
```
- Use streaming/workers for large files
- Always show import report with errors/skips/missing coords

### Transfer Pack Flow
```
Create Pack → Snapshot IDs → Run (Open → Done/Skip/Flag) → Resume later
```
- Pack stores deterministic snapshot (not live query)
- Progress persists in IndexedDB
- Works offline after initial load

### Component Conventions
- Use `useLiveQuery` from dexie-react-hooks for reactive DB queries
- shadcn/ui components in `src/components/ui/`
- Feature components grouped by domain (library, import, transfer)

## Performance Considerations
- Web Workers for ZIP extraction and CSV parsing
- Stream parsing for large files
- IndexedDB indexes on frequently queried fields
- Avoid loading entire DB into memory
