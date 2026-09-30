# Shared toast design

Replace the default Sonner success and error cards with one shared React Native
component rendered on web, iOS, and Android. Keep the existing toast API,
durations, haptics, positioning, stacking, and swipe-to-dismiss behavior.

Use a compact, borderless raised surface, soft shadow, small circular status
mark, and Inter text. Success draws its check as the card settles; errors use a
static exclamation mark. Keep color confined to the status mark, with no edge
stripes. Both themes must remain readable. Toasts stay announcement-only, with
recourse on the sheet.

Motion confirms the action, without celebration or looping. Use the existing
160 ms ease-out entrance and 120 ms exit tokens. Sonner retains control of
stacking and swipe gestures. Reduced motion removes translation and check-draw.

Use each library's supported custom-render API. No dependencies or native build
changes. Verify types, lint, class names, and the existing toast-copy tests.
