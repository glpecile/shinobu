---
status: pending
priority: P3
---

# Validate every form with zod

The connect forms and New list already use react-hook-form with `zodResolver`.
New list's schema (`src/features/lists/new-list-schema.ts`) shows the pattern:
one schema per form, rules that mirror what the provider's API accepts, every
rule in one `superRefine` so all errors show together, and a `transform` that
produces exactly what the mutation takes.

## Forms still on `useState`

- `src/features/lists/rename-list.tsx`: name is required and at most 500
  characters, the same rule as New list's name. Reuse that rule from the schema
  module instead of restating it.
- `src/features/log-media/log-confirm-sheet.tsx`: tags (Letterboxd lowercases
  and de-duplicates them, at most 100 of 200 characters each), the watched date
  (not in the future), and at least one selected provider. Check each provider's
  limits before adding a rule; don't invent one a provider doesn't apply.

Search fields stay uncontrolled by react-hook-form: a query isn't a form.

## The rule

Add to AGENTS.md, next to the Buttons section:

> Forms are react-hook-form with `zodResolver` and one schema per form, beside
> the form. A rule mirrors a limit the provider's API or editor applies, and
> the schema's output is what the mutation takes.

Then enforce it: an oxlint JS plugin rule that rejects a `TextField` whose
`value` comes from `useState`, with search fields exempt. Land the rule with the
last migration, so the lint run is clean when it starts.
