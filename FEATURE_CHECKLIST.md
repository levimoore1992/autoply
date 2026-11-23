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
- [x] Attach the generated resume to the actual resume field and bind it to the current job.
- [x] Run the complete app-driven form fill, attach its unchanged resume, and open Changes for review without submitting.

Follow-up verification: Chrome showed a five-field fill report; name, email, sponsorship No, the app-generated interest response, and the required resume attachment were present. The app-generated resume was left unchanged and its Changes view was opened. No submission occurred. Automated checks: 213 passed, 14 skipped; typecheck, focused lint, and extension build passed.

## Automatic submission tracking

- [x] Detect explicit success screens on supported Ashby, Lever, and Greenhouse job pages.
- [x] Match the tracked job and set Submitted with a timestamp, without submitting the form.
- [x] Persist offline confirmations and retry; deduplicate repeated confirmation screens.
- [x] Refresh the side panel after sync and pick up confirmations already open during extension reload.

Verified against the real Rescale success screen: only the Agentic AI Systems application became submitted; the other four remained in review. Automated checks: 216 passed, 14 skipped; typecheck, focused lint, and extension build passed. Generic thank-you messages, submit button clicks, and validation errors are not sufficient evidence. Redirects to generic pages that lose the job identity are left unmarked.

## Resume Qualifications section

- [x] Extract role-specific requirements and keywords from the full listing, including unstructured descriptions.
- [x] Match requirements to saved resume/profile evidence; validate source references and exclude unknown references and duplicate keywords.
- [x] Insert a single Qualifications section before Experience in all generated resumes.
- [x] Verify a real Rescale Backend Engineer example and visually inspect both PDF pages.

Verification: 220 tests passed, 14 skipped; typecheck, focused lint, and extension build passed. Existing resumes acquire the section when regenerated. The submitted application was not changed.
