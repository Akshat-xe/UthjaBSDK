# UI sync feature

`UpdateControl.ts` owns the single top-bar **Update all** action. It starts the local sync endpoint, polls its status without caching, renders each connector result in a modal, and emits status/completion events so visible pages can refresh.

The event fetch button on Opportunity Radar is intentionally separate because it only harvests public event listings. Do not add full-sync buttons to individual pages. Verify this module with `tests/browser/update-control.cjs`.
