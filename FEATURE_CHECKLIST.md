# Job review workflow

- [x] Open individual jobs from the side panel in a new tab.
- [x] Open all review jobs in tabs, with duplicate URLs removed and failures reported.
- [x] Preview resume changes against the original with line numbers, additions, and removals.
- [x] Verify the workflow in Chrome and rebuild the installed extension.

Verification:
- Chrome: an individual link opens the correct job in a new tab; the side panel stays available.
- Chrome: bulk opening creates five job tabs and activates the first.
- Chrome: resume Changes / Preview, Single View, and both document previews work at side-panel width.
- Automated: 206 tests passed, 14 existing scraper tests skipped; typecheck, focused lint, and extension build passed.

New tailored resumes capture their source resume at generation. Older drafts use the current profile's base resume with an explicit fallback label. The comparison shows text changes, including Markdown formatting, rather than PDF layout changes.

Each feature is committed separately. Existing local engine/setup changes are outside these commits.

## Application flow follow-up

- [x] Generate Ashby resumes through its public posting API, without requiring another installed browser.
- [x] Draft custom application answers and fill supported choice controls through Autoply.
- [ ] Run the complete app-driven form fill, attach its unchanged resume, and open Changes for review without submitting.
