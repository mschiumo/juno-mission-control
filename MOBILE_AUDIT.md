# Mobile Responsiveness Audit - Juno Mission Control

**Branch:** `feature/mobile-responsive`  
**Audit Date:** 2026-02-27  
**Auditor:** Subagent

---

## Executive Summary

The Juno Mission Control codebase has **moderate mobile support** with some components already handling mobile layouts well, while others need significant improvements. The main layout (`page.tsx`) and Trading View (`TradingView.tsx`) have basic mobile navigation implemented, but many data-heavy components (tables, grids, modals) need refinement for smaller screens.

---

## Current Mobile State

### ✅ Areas Working Well

1. **Main Navigation (page.tsx)**
   - Mobile hamburger menu implemented
   - Tab navigation converts to dropdown on mobile
   - Responsive header with logo scaling

2. **Trading View Navigation (TradingView.tsx)**
   - Sub-tab navigation uses hamburger menu on mobile
   - Desktop shows full button grid, mobile shows dropdown

3. **Goals Card (GoalsCard.tsx)**
   - Dedicated mobile view with stacked layout
   - Touch-friendly buttons with `min-h-[44px]` and `min-w-[44px]`
   - Bottom sheet modals for mobile
   - Selection mode with bulk actions

4. **Habit Card (HabitCard.tsx)**
   - Responsive stats grid
   - Touch sensors for drag-and-drop reordering
   - Proper spacing and touch targets

---

## 🔴 High Priority Issues

### 1. Calendar View - Trades Table (`components/trading/CalendarView.tsx`)

**Issues:**
- Trades table overflows horizontally on mobile
- Table has 8 columns (checkbox, date, symbol, side, shares, entry, PnL, status)
- No horizontal scroll container properly applied
- Text sizes don't scale down on small screens

**Current Code:**
```tsx
<div className="overflow-x-auto bg-[#161b22] border border-[#30363d] rounded-lg">
  <table className="w-full text-sm">
    {/* 8 columns of data */}
  </table>
</div>
```

**Proposed Fix:**
- Implement card-based layout for mobile instead of table
- Show only essential columns on mobile (symbol, PnL, status)
- Add expandable rows for full trade details
- Or use horizontal scroll with sticky first column

**Priority:** HIGH - Trading data is core functionality

---

### 2. Position Calculator (`components/trading/PositionCalculator.tsx`)

**Issues:**
- Two-column grid doesn't stack on mobile: `grid grid-cols-1 lg:grid-cols-2`
- Results grid has fixed single column but cards could be too wide
- No mobile-specific layout adjustments

**Current Code:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Left Column - Inputs */}
  {/* Right Column - Results */}
</div>
```

**Proposed Fix:**
- Ensure proper stacking on mobile (already has `grid-cols-1` for small screens)
- Review results cards sizing on narrow screens
- Test touch targets for inputs

**Priority:** HIGH - Critical trading tool

---

### 3. Profit Projection View (`components/trading/ProfitProjectionView.tsx`)

**Issues:**
- Input grid uses 4 columns on desktop but may not scale well: `grid grid-cols-2 md:grid-cols-4`
- "Trade Breakdown" section uses a 3-column grid that could overflow
- Results grid is 2 columns: `grid grid-cols-1 lg:grid-cols-2` (may need full width on mobile)

**Current Code:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
<!-- Trade Breakdown table -->
<div className="grid grid-cols-3 gap-4 text-sm">
```

**Proposed Fix:**
- Ensure single column layout for all inputs on very small screens
- Make trade breakdown table horizontally scrollable or stack vertically
- Full-width cards for projections on mobile

**Priority:** HIGH - Trading calculation tool

---

### 4. Analytics View (`components/trading/AnalyticsView.tsx`)

**Issues:**
- Stats grid: `grid grid-cols-2 md:grid-cols-4 gap-4` - 2 columns may still be too cramped
- "Performance by Symbol" list items have horizontal layout that may overflow
- Day of week grid uses `grid grid-cols-5 gap-2` which could be cramped on mobile

**Current Code:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
<div className="grid grid-cols-5 gap-2">
```

**Proposed Fix:**
- Consider single column stats on very small screens
- Make symbol performance cards stack vertically
- Stack day of week performance vertically or use horizontal scroll

**Priority:** HIGH - Analytics is frequently accessed

---

## 🟡 Medium Priority Issues

### 5. Projects Card / Agent Org Chart (`components/ProjectsCard.tsx`)

**Issues:**
- Org chart uses horizontal connectors that may not fit on mobile
- Grid layout for specialists: `grid grid-cols-2 md:grid-cols-4` may be too cramped
- Connection lines use absolute positioning that may break on small screens
- PR list items have complex layout with multiple elements

**Current Code:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
<div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-6">
```

**Proposed Fix:**
- Simplify org chart to vertical stack on mobile
- Use single column for specialist agents
- Remove or simplify connection lines on mobile
- Simplify PR list item layout

**Priority:** MEDIUM - Not critical for mobile use

---

### 6. Journal View (`components/trading/JournalView.tsx`)

**Issues:**
- Journal entry cards may have padding/margin issues on small screens
- Modal uses `max-w-2xl` which could be too wide for mobile
- Text areas may not resize properly

**Proposed Fix:**
- Ensure modal uses responsive max-width: `max-w-2xl` → `max-w-full sm:max-w-2xl`
- Review padding on entry cards for mobile
- Test textarea usability on mobile

**Priority:** MEDIUM - Important but less frequently used

---

### 7. Activity Log Card (`components/ActivityLogCard.tsx`)

**Issues:**
- Activity items have complex horizontal layout with icon, content, and metadata
- Filter pills may wrap awkwardly
- Max height of 500px may not be appropriate for mobile

**Proposed Fix:**
- Stack activity item content vertically on mobile
- Ensure filter pills wrap properly with gap
- Adjust max-height for mobile screens

**Priority:** MEDIUM - Monitoring feature, not critical

---

## 🟢 Low Priority Issues

### 8. Calendar Grid (`components/trading/CalendarView.tsx`)

**Issues:**
- Day cells use `aspect-[3/4]` on mobile which may make cells too small
- Day abbreviations show only first letter on mobile: `{day.slice(0, 1)}`
- Week totals column hidden on mobile but layout may still be cramped

**Current Code:**
```tsx
<div className="grid grid-cols-7 md:grid-cols-8">
<span className="md:hidden">{day.slice(0, 1)}</span>
```

**Proposed Fix:**
- Consider making calendar scrollable horizontally on mobile
- Increase touch target size for day cells
- Show full day names if space permits

**Priority:** LOW - Visual calendar, data shown elsewhere

---

### 9. Modal Consistency

**Issues:**
- Various modals use different max-widths and padding
- Some modals don't have mobile-specific styling
- Backdrop blur may cause performance issues on mobile

**Files Affected:**
- `TradeEntryModal.tsx` (needs review)
- `EveningCheckinModal.tsx` (needs review)
- Various inline modals in components

**Proposed Fix:**
- Standardize modal sizes: `max-w-full sm:max-w-md lg:max-w-lg`
- Use bottom sheet pattern for mobile where appropriate
- Review backdrop-blur usage

**Priority:** LOW - Polish item

---

### 10. Font Sizes and Touch Targets

**Issues:**
- Some text may be too small on mobile (`text-[10px]`, `text-xs`)
- Touch targets not consistently sized
- Some interactive elements lack proper padding

**Proposed Fix:**
- Minimum touch target: 44x44px
- Minimum font size on mobile: 14px for body text
- Review all `text-[10px]` and `text-xs` usage

**Priority:** LOW - Accessibility and usability polish

---

## Recommended Implementation Order

### Phase 1: Critical Trading Components (High Priority)
1. **CalendarView.tsx** - Fix trades table for mobile
2. **PositionCalculator.tsx** - Ensure proper mobile stacking
3. **ProfitProjectionView.tsx** - Fix grids and tables
4. **AnalyticsView.tsx** - Improve responsive grids

### Phase 2: Supporting Components (Medium Priority)
5. **ProjectsCard.tsx** - Simplify org chart on mobile
6. **JournalView.tsx** - Modal and card responsiveness
7. **ActivityLogCard.tsx** - Stack layouts vertically

### Phase 3: Polish (Low Priority)
8. **Calendar Grid** - Improve touch targets
9. **Modal Consistency** - Standardize across app
10. **Font/Touch Audit** - Accessibility improvements

---

## Technical Recommendations

### Breakpoint Strategy
Current breakpoints in use:
- `sm:` - 640px
- `md:` - 768px  
- `lg:` - 1024px
- `xl:` - 1280px

Recommendation: Add more granular mobile breakpoints:
```css
/* Consider adding */
@screen xs { /* < 480px */ }
```

### Mobile-First Patterns to Adopt

1. **Card-Based Tables** (for mobile)
```tsx
// Instead of tables on mobile
<div className="md:hidden space-y-2">
  {data.map(item => (
    <div className="p-3 border rounded-lg">
      {/* Card content */}
    </div>
  ))}
</div>
<table className="hidden md:table">
  {/* Desktop table */}
</table>
```

2. **Bottom Sheet Modals** (for mobile)
```tsx
<div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
  <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
    {/* Modal content */}
  </div>
</div>
```

3. **Responsive Grids**
```tsx
// Always start single column, expand up
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```

4. **Touch Targets**
```tsx
<button className="min-h-[44px] min-w-[44px] p-3">
  {/* Content */}
</button>
```

---

## Testing Checklist

- [ ] Test on iPhone SE (375px width) - smallest common device
- [ ] Test on iPhone 14 Pro Max (430px width) - large phone
- [ ] Test on iPad Mini (768px width) - tablet portrait
- [ ] Verify all touch targets are 44x44px minimum
- [ ] Verify text is readable without zooming (16px minimum)
- [ ] Test all modals open/close properly on mobile
- [ ] Verify no horizontal scrolling on main pages
- [ ] Test form inputs with on-screen keyboard
- [ ] Verify drag-and-drop works on touch devices

---

## Files Modified Summary

| File | Priority | Changes Needed |
|------|----------|----------------|
| `components/trading/CalendarView.tsx` | HIGH | Table → cards on mobile, fix overflow |
| `components/trading/PositionCalculator.tsx` | HIGH | Review grid stacking |
| `components/trading/ProfitProjectionView.tsx` | HIGH | Fix breakdown table, input grids |
| `components/trading/AnalyticsView.tsx` | HIGH | Responsive stats and day grid |
| `components/ProjectsCard.tsx` | MEDIUM | Simplify org chart |
| `components/trading/JournalView.tsx` | MEDIUM | Modal responsiveness |
| `components/ActivityLogCard.tsx` | MEDIUM | Stack layouts |
| `app/page.tsx` | LOW | Already mostly responsive |
| `components/TradingView.tsx` | LOW | Already responsive |

---

## Next Steps

1. Create feature branch from `feature/mobile-responsive`
2. Start with CalendarView.tsx trades table redesign
3. Implement card-based mobile tables
4. Add touch target improvements
5. Test on actual mobile devices
6. Iterate based on testing feedback

---

*End of Audit Document*
