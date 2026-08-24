# Interface language decision

VaultMind ships with English and Brazilian Portuguese interface dictionaries.

English is the default because the repository, code identifiers, and public technical documentation use English. Portuguese remains available from the vault menu and is useful for local use and demos.

The implementation deliberately stays small:

- dictionaries live in `src/lib/i18n.ts`;
- the selected locale is stored in a cookie;
- routes do not include locale prefixes;
- source documents keep their original language;
- answer prompts use the active interface language.

New interface text must be added to both dictionaries in the same change. Provider errors and log messages remain English so diagnostics are consistent.
