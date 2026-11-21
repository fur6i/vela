# Vela 0.10.0 performance checks

Measured locally against the pre-change 0.9.2 source, using the same Electron 45.4.1 / Chromium 156 runtime and synthetic pages. The original raw samples are local test artifacts and are intentionally excluded from public source exports. These historical measurements are not a benchmark of 0.11.0.

| Scenario, before first sidebar/dock use | Private memory before | Private memory after | Processes before / after |
| --- | ---: | ---: | ---: |
| Home, no website tabs | 398.2 MiB | 324.3 MiB | 6 / 4 |
| 8 loaded pages retaining 16 MiB each, plus 20 dormant tabs | 698.2 MiB | 641.3 MiB | 14 / 12 |

These are single-run, local measurements, not a competitor ranking. Private bytes avoid double-counting shared working-set pages. The raw reports also include summed working sets, which can double-count shared memory. Idle CPU was approximately 0.1% in both 3-second samples; no measured idle CPU improvement is claimed. Once opened, sidebar/dock renderers remain available to preserve forms and immediate subsequent interaction, so the two-process saving applies before their first use.

The sidebar and extension dock load on demand, with intent-based prewarming. Hidden surfaces stop receiving unsolicited full-state updates and receive the latest state when reopened. Each surface builds only its relevant tab rows; the dock skips rendering the hidden browser chrome. Hover tracking polls less often while inactive, pinned or covered, then wakes on focus/restore or mode changes. Hardware acceleration, site isolation, sandboxing, media playback and loaded website state remain enabled. There is no new automatic tab suspension or forced garbage collection.

Filter downloads use Chromium networking instead of Node's Undici HTTP parser. Cached filters are reused for eight hours; cold startup uses the existing offline protection while fetching the full lists in the background.

Run `npm.cmd run benchmark` to measure the current build on the same workload. It uses an isolated smoke profile, local HTTP pages, eight retained 16 MiB application buffers and twenty unvisited tabs. It writes `performance-after.json`; output varies with the machine and system load. `npm.cmd run smoke` additionally checks interrupted transfers, multipart upload serialization, lazy panel reopening and two real private child processes with cookie isolation and temporary-profile cleanup.

## Release 0.11.0

Sidebar hover polling relaxes to 120 ms when closed and more than 300 px from the left edge, returning to 32 ms near the edge or while open. A bounded cache keeps at most 20 recent tab thumbnails and releases entries immediately on close; late capture results cannot re-add closed tabs. Private cleanup no longer launches an Electron process: direct removal, a lock-error-only hidden PowerShell fallback, and asynchronous owned-orphan cleanup handle it. Duplicate dock CSS and unused landscape/font resources were removed without changing sandboxing, media settings or loaded tab state.

Run `npm run check` and `npm run smoke` for functional and security regression checks. No claim of beating other browsers, a measured RAM reduction for this release, or zero resource tradeoffs is made without repeatable comparative benchmarks.
