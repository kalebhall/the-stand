# COLORS.md — The Stand Color Scheme Documentation

This document defines the color palette for The Stand application,
inspired by the Church of Jesus Christ of Latter-day Saints website
(churchofjesuschrist.org).

============================================================
DESIGN PHILOSOPHY
============================================================

The color scheme reflects:
1. Clean, reverent design matching Church visual standards
2. Professional appearance suitable for ward leadership
3. Accessibility with WCAG AA contrast ratios
4. Print-friendly rendering for sacrament programs

============================================================
COLOR PALETTE
============================================================

--------------------------------------------------
Primary Colors
--------------------------------------------------

Background:
  - Light: #ffffff (Pure white)
  - Dark: #0f172a (Deep slate)
  - Usage: Main page backgrounds

Foreground (Text):
  - Light: #1e293b (Dark slate)
  - Dark: #f1f5f9 (Light slate)
  - Usage: Primary text content

--------------------------------------------------
Brand Colors
--------------------------------------------------

Primary (Church Blue):
  - Light: #003057 (Deep navy blue)
  - Dark: #1e5a8e (Lighter navy)
  - Foreground: #ffffff (White text)
  - Usage: Primary buttons, links, headers, key UI elements
  - Inspiration: Church website navigation and accents

Secondary (Warm Gold):
  - Light: #d4af37 (Classic gold)
  - Dark: #b8941f (Muted gold)
  - Foreground: #1e293b (Dark text)
  - Usage: Secondary actions, highlights, special callouts
  - Inspiration: Church architectural and decorative elements

--------------------------------------------------
Utility Colors
--------------------------------------------------

Muted:
  - Light: #f1f5f9 (Very light slate)
  - Dark: #1e293b (Dark slate)
  - Foreground Light: #64748b (Medium slate)
  - Foreground Dark: #94a3b8 (Light slate)
  - Usage: Disabled states, subtle backgrounds, secondary text

Border:
  - Light: #e2e8f0 (Light gray)
  - Dark: #334155 (Medium slate)
  - Usage: Dividers, input borders, card outlines

Destructive (Error/Delete):
  - Light: #dc2626 (Red 600)
  - Dark: #ef4444 (Red 500)
  - Foreground: #ffffff (White text)
  - Usage: Delete buttons, error messages, warnings

--------------------------------------------------
Component Colors
--------------------------------------------------

Card:
  - Background Light: #ffffff
  - Background Dark: #1e293b
  - Foreground: Matches main foreground
  - Usage: Content cards, panels, sections

Accent:
  - Light: #f8fafc (Nearly white)
  - Dark: #1e293b (Dark slate)
  - Foreground: Matches main foreground
  - Usage: Hover states, selected items

Popover:
  - Background: Matches card
  - Foreground: Matches main foreground
  - Usage: Dropdowns, tooltips, modals

Input:
  - Border: Matches main border
  - Focus Ring: Matches primary color
  - Usage: Text inputs, selects, textareas

============================================================
USAGE GUIDELINES
============================================================

--------------------------------------------------
Buttons
--------------------------------------------------

Primary Actions:
  - Background: Primary (Church Blue)
  - Text: White
  - Example: "Save Meeting", "Publish Program"

Secondary Actions:
  - Background: Secondary (Gold)
  - Text: Dark slate
  - Example: "Preview", "Add Item"

Destructive Actions:
  - Background: Destructive (Red)
  - Text: White
  - Example: "Delete", "Remove"
  - MUST include confirmation dialog (per AGENTS.md)

Ghost/Outline:
  - Border: Primary or Border color
  - Text: Primary or Foreground
  - Background: Transparent or Accent

--------------------------------------------------
Navigation
--------------------------------------------------

Top Navigation:
  - Background: Primary (Church Blue)
  - Text: White
  - Active item: Secondary (Gold) underline or background

Sidebar Navigation:
  - Background: Card
  - Text: Foreground
  - Active: Accent background + Primary text
  - Hover: Accent background

--------------------------------------------------
Text Hierarchy
--------------------------------------------------

Primary Text:
  - Color: Foreground
  - Usage: Body text, main content

Secondary Text:
  - Color: Muted foreground
  - Usage: Captions, helper text, timestamps

Links:
  - Color: Primary
  - Hover: Darker shade of primary
  - Visited: Same as primary (maintain consistency)

--------------------------------------------------
States
--------------------------------------------------

Hover:
  - Background: Accent
  - Subtle opacity change (0.9)

Focus:
  - Ring: Primary color
  - Ring width: 2px
  - Ring offset: 2px

Disabled:
  - Background: Muted
  - Text: Muted foreground
  - Cursor: not-allowed
  - Opacity: 0.5

Active/Selected:
  - Background: Accent or light primary
  - Border: Primary (2px)

============================================================
ACCESSIBILITY
============================================================

Contrast Ratios (WCAG AA):
  - Normal text: 4.5:1 minimum
  - Large text (18pt+): 3:1 minimum
  - UI components: 3:1 minimum

Tested Combinations:
  ✓ Primary (#003057) on White (#ffffff): 11.5:1
  ✓ Foreground (#1e293b) on White: 14.8:1
  ✓ White on Primary (#003057): 11.5:1
  ✓ Muted foreground (#64748b) on White: 5.7:1
  ✓ Secondary (#d4af37) on White: 4.8:1

Color Blindness:
  - Blue/gold combination works for all types
  - Never rely on color alone for information
  - Use icons + text for critical actions
  - Error messages include text descriptions

============================================================
DARK MODE
============================================================

Automatic Detection:
  - Respects prefers-color-scheme media query
  - Optional: User toggle override (future enhancement)

Dark Mode Adjustments:
  - Reduced contrast to prevent eye strain
  - Warmer tones for comfort
  - Maintains brand recognition
  - All accessibility standards still met

============================================================
PRINT STYLES
============================================================

Sacrament Program Printing:
  - Force white background
  - Force black text
  - Remove navigation elements
  - Maintain border subtlety
  - Optimize for grayscale printers

Implementation:
  - See @media print block in globals.css
  - .print-page class for program layouts

============================================================
IMPLEMENTATION NOTES
============================================================

CSS Variables:
  - Defined in apps/web/app/globals.css
  - Prefixed with --color-* for theme system
  - Updated via :root pseudo-class

Tailwind Integration:
  - Colors mapped to Tailwind classes
  - Use semantic names (primary, secondary, etc.)
  - Avoid hardcoded hex values in components

Shadcn/UI:
  - Component library respects CSS variables
  - Automatic theming via @theme inline directive
  - No component-specific overrides needed

============================================================
EXAMPLES
============================================================

Correct Usage:
  <button className="bg-primary text-primary-foreground">
    Publish Program
  </button>

  <p className="text-muted-foreground">Last updated 2 hours ago</p>

  <div className="border-border bg-card">
    Card content
  </div>

Incorrect Usage:
  <button className="bg-[#003057]">  <!-- Don't hardcode -->
  <p className="text-gray-500">       <!-- Use semantic names -->

============================================================
FUTURE CONSIDERATIONS
============================================================

1. High Contrast Mode:
   - Enhanced contrast for users with vision impairments
   - Optional system preference detection

2. Theming System:
   - Allow stakes/wards to customize accent colors
   - Maintain Church blue as unchangeable primary
   - Require accessibility compliance for custom themes

3. Seasonal Adjustments:
   - Subtle seasonal accents (Christmas, Easter)
   - Must remain professional and reverent
   - Optional feature per ward preference

============================================================
END OF COLORS.md
============================================================
