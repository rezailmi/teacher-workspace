---
title: "feat: Match Posts design to prototype"
type: feat
status: completed
date: 2026-04-08
---

# feat: Match Posts Design to Prototype

## Overview

Update the Posts detail and create pages to match the design prototype at `String-sg/design-teacher-workspace`. The current implementation uses flat layouts and plain inputs. The prototype uses card-based form sections, a two-column detail layout, a type picker flow, rich text editing, and a split post/schedule button.

## Changes by Page

### 1. Post Detail Page — Two-Column Layout

**Current:** Single column with vertical stack (status → description → tracking → recipients).

**Target:** Two-column grid on `lg+` (`lg:grid-cols-3`):

```
┌────────────────────────────────┬──────────────────────┐
│ LEFT (col-span-2)              │ RIGHT (col-span-1)   │
│                                │                      │
│ RESPONSES RECEIVED card        │ ANNOUNCEMENT card     │
│ ┌─────────────────────────┐    │ ┌──────────────────┐  │
│ │ 2 / 3     1 YES  1 NO  │    │ │ Title             │  │
│ │ 1 no response           │    │ │                   │  │
│ │ ████████████░░░░  2/3   │    │ │ Description...    │  │
│ └─────────────────────────┘    │ │                   │  │
│                                │ │ Enquiry contact   │  │
│ RESPONSE STATUS card           │ │ tanml@bandung...  │  │
│ ┌─────────────────────────┐    │ │                   │  │
│ │ 🔍 Search  Filter Cols  │    │ │ Staff in charge   │  │
│ │ 3 recipients             │    │ │ Mrs Tan Mei Lin   │  │
│ │ Student │ Index │ Class  │    │ └──────────────────┘  │
│ │ Priya   │ 04    │ 3A    │    │                      │
│ │ Chen    │ 01    │ 3A    │    │                      │
│ └─────────────────────────┘    │                      │
└────────────────────────────────┴──────────────────────┘
```

**Files to modify:**
- `web/containers/PostDetailView.tsx` — restructure to grid layout, move announcement content to right sidebar card

**New component:**
- `web/components/comms/AnnouncementCard.tsx` — right sidebar card showing title, description, enquiry email, staff in charge, shortcuts, attachments

### 2. Create Page — Type Picker + Card-Based Form

#### 2a. Type Picker (new route or modal)

**Target:** Full-page selection before the form:

```
           What would you like to create?
            Choose a type to get started.

  ┌─────────────────────┐  ┌─────────────────────┐
  │ ░░░░░░░░░░          │  │ ░░░░░░░░            │
  │ ░░░░░░░░░░░         │  │ ░░░░░░░░░           │
  │ ░░░░░░░░░░          │  │ ██████████████████  │
  │ ░░░░░░░░            │  │                     │
  │                     │  │                     │
  │ Post                │  │ Post with Response  │
  │ Send a post to      │  │ Send a post and     │
  │ parents.            │  │ collect responses.  │
  └─────────────────────┘  └─────────────────────┘
```

**Approach:** Show the type picker as the initial state of CreatePostView when no type is selected yet. Use local state (`selectedType: 'post' | 'post-with-response' | null`) to toggle between picker and form. No new route needed.

**New component:**
- `web/components/comms/PostTypePicker.tsx` — two-card grid with mockup illustrations, title, description

#### 2b. Card-Based Form Sections

**Current:** Flat form with `<Separator>` between sections.

**Target:** Sections wrapped in bordered cards with uppercase section headers:

```
┌ RECIPIENTS ──────────────────────────────────────┐
│                                                   │
│  Students *                                       │
│  Parents of the selected students will receive... │
│  ┌──────────────────────────────────────────┐     │
│  │ Search students, classes, CCAs...        │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Staff in charge                                  │
│  ┌──────────────────────────────────────────┐     │
│  │ Search staff by name or group...         │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Enquiry email                                    │
│  ┌──────────────────────────────────────────┐     │
│  │ Select or add an email...            ▾   │     │
│  └──────────────────────────────────────────┘     │
└───────────────────────────────────────────────────┘

┌ CONTENT ─────────────────────────────────────────┐
│                                                   │
│  Title *                               0/120      │
│  ┌──────────────────────────────────────────┐     │
│  │ e.g. Term 3 School Camp Consent...       │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Description                           0/2000     │
│  ┌──────────────────────────────────────────┐     │
│  │ B I U S <> H1 H2 H3 ≡ ≡ ≡ • # ✓ ❝ 🔗 ✨│     │
│  ├──────────────────────────────────────────┤     │
│  │ Write your announcement here...          │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Shortcuts                                        │
│  ┌──────────────────────────────────────────┐     │
│  │ ☐ Declare travels                        │     │
│  ├──────────────────────────────────────────┤     │
│  │ ☐ Edit contact details                   │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Attachments                                      │
│  Files 0/3 · Add up to 3 files, <5MB each         │
│  ┌──────────┐                                     │
│  │ 📎 Add   │                                     │
│  └──────────┘                                     │
│  Photos 0/12                                      │
└───────────────────────────────────────────────────┘
```

**Files to modify:**
- `web/containers/CreatePostView.tsx` — wrap form sections in cards, reorder (Recipients first, then Content), add section headers

#### 2c. Header Redesign

**Current:** "Back to Posts" link + Save Draft + Send buttons.

**Target:**
```
← New Post                              👁 Show Preview   [📤 Post ▾]
```

- Back arrow + "New Post" (or "Edit Post") title
- "Show Preview" toggle button (eye icon)
- Split "Post" button: primary action (Post now) + dropdown chevron (Schedule for later)

**New component:**
- `web/components/comms/SplitPostButton.tsx` — Button + DropdownMenu trigger, handles post now / schedule options

#### 2d. Rich Text Editor

**Current:** Plain `<Textarea>` for description.

**Target:** Toolbar with formatting buttons above the text area. For the initial implementation, keep `<Textarea>` but add a **visual-only toolbar** (non-functional buttons showing the intended formatting options). Full Tiptap integration is a follow-up.

**New component:**
- `web/components/comms/RichTextToolbar.tsx` — toolbar row with icon buttons (B, I, U, S, <>, H1, H2, H3, alignment, lists, blockquote, link, highlight). Non-functional for now — the Textarea remains the input.

#### 2e. Shortcuts as Bordered Rows

**Current:** Inline checkboxes.

**Target:** Each shortcut in its own bordered row:
```
┌──────────────────────────────────┐
│ ☐  Declare travels               │
├──────────────────────────────────┤
│ ☐  Edit contact details          │
└──────────────────────────────────┘
```

**File to modify:** Inline in `CreatePostView.tsx` — wrap each shortcut checkbox in a bordered container.

#### 2f. Attachments Section (new, visual only)

**Target:** Show file and photo upload areas with counts. Non-functional for now.

```
Attachments
Files 0/3 · Add up to 3 files, less than 5 MB each.
┌──────────┐
│ 📎 Add   │
└──────────┘
Photos 0/12 · Add up to 12 photos, less than 5 MB each.
```

**New component:**
- `web/components/comms/AttachmentSection.tsx` — visual placeholder with file/photo counters and disabled add buttons

### 3. Recipient Table Toolbar

**Current:** Plain table with no toolbar.

**Target:** Search + Filter + Columns + Export toolbar above the table:
```
🔍 Search student or parent...   ⚙ Filter   ⊞ Columns   ⬇ Export
3 recipients
```

**File to modify:** `web/components/comms/RecipientReadTable.tsx` — add toolbar row with search input and button placeholders (Filter, Columns, Export as disabled buttons).

## Implementation Phases

### Phase 1: Detail Page Two-Column Layout

1. Create `AnnouncementCard.tsx` — right sidebar card
2. Restructure `PostDetailView.tsx` to `lg:grid-cols-3` layout
3. Move description, enquiry email, staff-in-charge into AnnouncementCard
4. Keep response tracking + recipient table on the left (col-span-2)
5. Add toolbar to RecipientReadTable (search + placeholder buttons)

### Phase 2: Create Page Card Layout + Type Picker

1. Create `PostTypePicker.tsx` — type selection cards
2. Add type picker state to CreatePostView (show picker when no type selected)
3. Wrap form sections in `Card` with uppercase section headers
4. Reorder: RECIPIENTS card first, CONTENT card second
5. Update shortcuts to bordered row style
6. Create `AttachmentSection.tsx` placeholder

### Phase 3: Header + Split Button + Rich Text Toolbar

1. Create `SplitPostButton.tsx` — split button with dropdown
2. Create `RichTextToolbar.tsx` — visual-only formatting toolbar
3. Redesign CreatePostView header (New Post title, preview toggle, split button)
4. Add toolbar above Textarea in the CONTENT card
5. Add character counters (0/120 for title, 0/2000 for description)

## Files Summary

### New Components
| File | Purpose |
|------|---------|
| `web/components/comms/AnnouncementCard.tsx` | Detail page sidebar card |
| `web/components/comms/PostTypePicker.tsx` | Type selection (Post vs Post with Response) |
| `web/components/comms/SplitPostButton.tsx` | Split Post/Schedule button |
| `web/components/comms/RichTextToolbar.tsx` | Visual formatting toolbar |
| `web/components/comms/AttachmentSection.tsx` | File/photo upload placeholder |

### Modified Files
| File | Changes |
|------|---------|
| `web/containers/PostDetailView.tsx` | Two-column grid layout |
| `web/containers/CreatePostView.tsx` | Type picker, card sections, header redesign |
| `web/components/comms/RecipientReadTable.tsx` | Add search/filter/export toolbar |

## Acceptance Criteria

- [ ] Detail page uses two-column layout on lg+ (response left, announcement right)
- [ ] AnnouncementCard shows title, description, enquiry contact, staff in charge
- [ ] RecipientReadTable has search input + Filter/Columns/Export button placeholders
- [ ] Create flow starts with type picker (Post vs Post with Response)
- [ ] Form sections wrapped in bordered cards with uppercase headers (RECIPIENTS, CONTENT)
- [ ] Recipients section comes before Content section
- [ ] Shortcuts displayed as bordered checkbox rows
- [ ] Attachments section shows file (0/3) and photo (0/12) counters with disabled add button
- [ ] Header shows "New Post" + Show Preview toggle + split Post button with Schedule dropdown
- [ ] Rich text toolbar displayed above textarea (visual only, non-functional)
- [ ] Title shows character counter (0/120), description shows (0/2000)
- [ ] All styling follows Flow DS token-first approach (DESIGN.md)
- [ ] `pnpm build` passes with no TypeScript errors

## Sources

- Design prototype: `String-sg/design-teacher-workspace`
  - Create page: `src/routes/announcements.new.tsx`
  - Detail page: `src/routes/announcements.$id.tsx`
  - Rich text editor: `src/components/comms/rich-text-editor.tsx`
  - Send confirmation: `src/components/comms/send-confirmation-sheet.tsx`
- Current implementation:
  - `web/containers/PostDetailView.tsx`
  - `web/containers/CreatePostView.tsx`
  - `web/components/comms/RecipientReadTable.tsx`
- Architecture doc: `.claude/docs/architecture.md`
- Design system: `DESIGN.md`
