# Executive Summary: The Shinobu Philosophy

Traditional multi-app workflows introduce friction. Every time you switch apps to log an episode, update a movie diary, or tick a manga chapter, you are spending unnecessary "energy keystrokes."

**Shinobu (忍)** is designed on the ultimate premise of **Houtarou-style energy conservation**: *If you don't have to do it, don't. If you have to do it, do it efficiently in one unified system.*

By treating your system as an **API Aggregator** (rather than maintaining a heavy proprietary media database), your codebase will scale linearly while its intelligence compounds exponentially.

---

# Phase 1: Ideate & Brainstorm

*Objective: Solidify scope, define core boundaries, and explicitly align on architectural limits before writing code.*

### 1.1 Product Specification Archetype

* **Target Platforms:** Cross-platform layout deployment using **Expo** targeting Web (Desktop browser responsive canvas), iPadOS (Grid-optimized master hub), and Android/iOS mobile environments.
* **Core Concept:** One frontend client to control separate streaming tracking backends.
* **Visual Persona:** Minimalist, geometric layout inspired by *Studio Shaft's Monogatari* styling. High-contrast typography, dark mode-first implementation with **Vampiric Crimson (`#DC2626`)** accents, and the icon **"忍"** representing the silent core underlying the infrastructure.

### 1.2 Data Source Mapping Boundaries

* **The TV Engine:** **Trakt.tv API (v2 REST)** handles live-action television metadata and records progress endpoints (`/sync/watched`).
* **The Movie Engine:** **Trakt.tv API (v2 REST)** serves as the live operational pipeline for logging film history. (Letterboxd history is imported via a parsing script or file upload to pre-populate Trakt).
* **The Anime & Manga Engine:** **AniList API (GraphQL)** handles tracking of eastern animation media and sequential text panels seamlessly without local state persistence.

---

# Phase 2: Architectural Plan

*Objective: Design an agent-native environment where code dependencies do not fragment over time, keeping context highly accessible.*

### 2.1 The Unified State Aggregator Pattern

Instead of components handling individual endpoints, the app establishes a **Unified Feed Hook** (`useUnifiedFeed`). On app boot, this hook orchestrates parallel asynchronous fetches:

```
                      [ useUnifiedFeed Hook ]
                                 │
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
     [ Trakt REST API ]                     [ AniList GraphQL ]
   GET /sync/watched/shows                query { MediaList(status: CURRENT) }
             │                                       │
             └───────────────────┬───────────────────┘
                                 ▼
                    [ Array Normalization Layer ]
       Maps distinct payloads into a unified `MediaItem` interface
                                 │
                                 ▼
                     [ Render Canvas UI Grid ]

```

### 2.2 System Schemas & Types

Define an immutable interface inside `types/media.ts` so future agents understand the normalized shape explicitly without guessing variable definitions.

```typescript
export interface NormalizedMediaItem {
  id: string;          // Unique combined identifier: `trakt-${id}` or `anilist-${id}`
  title: string;
  coverImage: string;
  type: 'TV' | 'MOVIE' | 'ANIME' | 'MANGA';
  currentProgress: number; // Episode or Chapter index
  totalEpisodes?: number;
  lastUpdated: string;
  externalIds: {
    tmdb?: number;
    trakt?: number;
    anilist?: number;
  };
}

```

---

# Phase 3: The Automated Work Loop

*Objective: Build modularly using isolated context strategies. Write less code manually, automate standard API scaffolding, and pass structural specs to agent workspaces.*

### 3.1 Establishing Environment Context for Agents

Create an entry asset file named `.cursorrules` or `AGENTS.md` at the root of your project directory. This teaches any agent environment (Claude Code, Cursor Composer) the standards of your system before it attempts execution.

```markdown
# Shinobu Project Context & Conventions

## System Architecture
- Universal Frontend: Expo (React Native Web + Native Bundle)
- UI Library: Tailwind CSS via NativeWind v4 (Tailwind structure for cross-platform matching)
- Strictly DB-less: State is tied to external authentication tokens.

## Code Standards
- All network interactions must conform to the `NormalizedMediaItem` data contract.
- Component Design: Leverage asymmetric white space and hard black borders mimicking anime title cards.
- Layouts must be explicit: Avoid using grid/flex calculations blindly that do not resolve cleanly on Expo Web. Use explicit platform breakpoints (`Platform.OS`).

```

### 3.2 Core Component Blueprint: The Aggregated Media Card

Agents should focus on generating pure functional components. Below is the reference blueprint for handling the unified increment action across networks.

```tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { NormalizedMediaItem } from '../types/media';

interface MediaCardProps {
  item: NormalizedMediaItem;
  onIncrementProgress: (item: NormalizedMediaItem) => Promise<void>;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, onIncrementProgress }) => {
  return (
    <View style={styles.cardContainer}>
      <Image source={{ uri: item.coverImage }} style={styles.posterImage} />
      <View style={styles.metaOverlay}>
        <Text style={styles.titleText} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.typeBadge}>{item.type}</Text>
        
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Progress: {item.currentProgress}</Text>
          <TouchableOpacity 
            style={styles.incrementButton}
            onPress={() => onIncrementProgress(item)}
          >
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.StyleSheet.create({
  cardContainer: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
    margin: 8,
    width: 160,
    height: 240,
  },
  posterImage: { width: '100%', height: '100%', opacity: 0.7 },
  metaOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.85)' },
  titleText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  typeBadge: { color: '#DC2626', fontSize: 10, letterSpacing: 1, marginTop: 2, fontWeight: '600' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  progressText: { color: '#AAA', fontSize: 11 },
  incrementButton: { backgroundColor: '#DC2626', width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});

```

---

# Phase 4: Automated Review & Human Polish

*Objective: Build safety nets instead of gatekeeping manually. Review the systemic output, then insert visual polish.*

### 4.1 Automated Validation Harness

Before manual visual checks, execute automated evaluation workflows to test compliance:

1. **GraphQL Boundary Check:** Ensure mutations to AniList pass the specific input constraints (`mediaId`, `progress`).
2. **OAuth Dynamic Intercept:** Validate that expired access tokens securely refresh in the storage manager without forcing app failure.
3. **Expo Web vs Tablet Check:** Run lint sweeps checking that absolute positions map logically into wider display environments.

### 4.2 The Monogatari Design Polish Layer

Once passing core data tests, polish the styling interface to align directly with the aesthetic constraints:

* **The Flash-Frame Transition:** Build a custom screen routing controller that handles page loading states by triggering a flat, full-bleed screen color change (Solid black page with a single word in bold white type like `"LOADING"` or `"SYNCHRONIZING"`) for 150ms before displaying content.
* **Asymmetric Typography Layout:** Push typography layouts towards left-heavy borders, stark contrasts, and ample breathing room over grid containers.

---

# Phase 5: The Compounding System Loop

*Objective: Ensure that every edge case tracked or bug solved makes future feature additions faster, not slower.*

```
 [ Bug Occurs: Trakt API Rate Limit Hit ]
                    │
                    ▼
     [ Step 1: Mitigate Codebase ]
        (Add Exponential Backoff)
                    │
                    ▼
 [ Step 2: Update System Memory (Artifact) ]
    Write rule directly into `COMPOND_MEMORIES.md`
                    │
                    ▼
   [ Next Loop: Agent Reads Memory ]
 Agent builds new profile tracker tab using the updated backoff pattern automatically

```

### 5.1 Implementation: Managing `COMPOUND_MEMORIES.md`

Every time a network anomaly happens (e.g., Trakt tracking matching failure, AniList character paging mismatch), do not just fix the file. **Explicitly log the rule** in a persistent project artifact.

Future automated planning phases are required to inspect this file prior to structuring refactor iterations:

```markdown
# System Core Compounded Memory Directory

## Network Memory Updates
- **Rule 101 (Trakt Rate Handling):** Trakt API limits requests to 5 per second on public unauthenticated endpoints. When writing lists or syncing history, batched payloads must be wrapped inside a throttling queue.
- **Rule 102 (AniList Character Encoding):** Manga tracking parsing requires monitoring both standard titles and Romanized titles. If a direct match fails, fall back to checking the metadata query cross-referenced via TMDB source IDs.
- **Rule 103 (Expo iPad Layout Split):** Tablets running iPadOS must maintain a dual-column layout split: left panel serves navigation and global statistics, right viewport hosts the dynamic grid scroll. Do not stack elements vertically on screens exceeding 768px wide.

```

By enforcing this four-part loop, your custom client application will grow smarter and cleaner with every feature branch you merge.