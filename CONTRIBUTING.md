# Contributing to MdBundle for Zotero

Thank you for your interest in contributing! Here's how you can help:

## Reporting Bugs

1. Check if the issue already exists in [Issues](https://github.com/wcmendes/MdBundle-for-Zotero/issues)
2. Open a new issue with:
   - Your Zotero version (e.g., 9.0.6)
   - Your OS (Windows/macOS/Linux)
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Error Console output if available (Tools → Developer → Error Console)

## Suggesting Features

Open an issue with the `enhancement` label describing your use case and proposed feature.

## Translations

We welcome translations! To add a new language:

1. Copy `src/locale/en-US/mdbundle.ftl` to `src/locale/<your-locale>/mdbundle.ftl`
2. Translate all values (keep the keys unchanged)
3. Add your locale to the `supported` array in `src/mdbundle.js` → `loadStrings()`
4. Submit a Pull Request

## Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes in `src/`
4. Test by building the XPI: `cd src && zip -r ../mdbundle.xpi .`
5. Install and test in Zotero
6. Commit and push
7. Open a Pull Request

## Building

```bash
cd src
zip -r ../mdbundle.xpi .
```

Then install the XPI in Zotero: Tools → Add-ons → ⚙️ → Install Add-on From File.

## Code Style

- Use tabs for indentation
- Use `async/await` for asynchronous code
- All user-facing strings must use the `this.s('key')` i18n system
- Add corresponding entries to all locale `.ftl` files (at minimum `en-US`)
