# Excel Report Manager: notes for contributors and AI assistants

## UI consistency (@nuvriqo/ui)

This app uses the shared Nuvriqo UI kit (`@nuvriqo/ui`). The style guide is in [rdersley/nuvriqo-ui](https://github.com/rdersley/nuvriqo-ui) (`docs/STYLE_GUIDE.md`).

- No hardcoded colours in app CSS. Use `var(--nq-*)` tokens. `npm run build` runs `check:ui` first. Excel workbook colours in JS (cell fills in the exported file) are not UI and keep their hex values.
- The four Custom UI resources (`admin-ui`, `hardware-ui`, `navigator-ui`, `portal-admin-ui`) import `@nuvriqo/ui/css`, their own `styles.css`, then the shared `static/nuvriqo-v1.css`, which maps legacy classes to kit variables. All four call `enableTheme(view)`.
- New screens use the kit's classes: `nq-header`, `nq-card`, `nq-kpi`, `nq-notice`, `nq-empty`, `nq-table`, `nq-btn`, `nq-field`.
- `static/portal-ui` isn't referenced by the manifest. Don't restyle it.
- Changing `marketplace/RELEASE_TRIGGER.txt` on main releases to production. Never touch it in UI work.
