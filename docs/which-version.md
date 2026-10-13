# Which version is running

A phone that comes back to a tab can show the page it saved, with the app of
that day. That copy can be older than the page the site publishes. The older
app's files stay on the site, so the page still opens. The running build is named in the log, in About,
and in the page source.

## The build that is open

The log's first line, as the tour opens, names it:

```text
App built 2026-10-04 20:23 UTC from a9e8e9d with FOSS Earth 930f725.
```

The time is the build's, to the minute. The first commit is this repository.
The second is FOSS Earth. `-dirty` after a commit means that build had
uncommitted changes in the files it is made from.

**About**, a tab under **+**, has the same in full: this repository, FOSS Earth,
and the other checkouts the build records, each with its commits and links to
its source, and every package's version. Its line for the site's latest deploy
is fetched when About opens. That line is the site's deploy, and it is the same
on a page the browser has kept for days.

**Settings → App files** says whether this page is the published one, when the
site was last asked, and has **Ask now**.

The page asks the site for its own HTML when it opens, when it is shown again,
when the network returns, and about every ten minutes while it is shown. GitHub
Pages allows a browser to reuse a page for ten minutes; asking replaces that
copy with the published page. An older page that nobody has touched reloads
itself once and says so in the log. A page someone has touched stays as it is
and offers **Reload**. A reload that is answered with the old copy again stops
there and says the browser is still showing its own copy.

An app published before that check has no build line and does not ask. Reload
the tab, or close it and open the address in a new one. The builds of 3–4
October 2026, and how their Settings tabs differed, are recorded in
[content-delivery.md](content-delivery.md) under "The phones the day after".

A development server writes no build line.

## What the site publishes

```sh
curl -s -A foss-earth-check/1.0 https://umn-vr.github.io/tour/minneapolis/ | grep -o '<meta name="foss-earth[^>]*>'
```

| Meta | What it is |
| --- | --- |
| `foss-earth-build` | When this page was built |
| `foss-earth-app-source` | This repository's commit, from `__SOURCE_VERSION__` |
| `foss-earth-source` | FOSS Earth's commit |

`-dirty` means the same thing here as in the log. On the tour, `foss-earth-app-source` is this repository and `foss-earth-source` is FOSS Earth.

## The report

[Reporting a bug](bug-reporting.md) is how a fault is filed. If the tour does
not stay open long enough to reach **+**, add `?report` to its address
(<https://umn-vr.github.io/tour/twin-cities/?report>): the page shows the
previous visit's report and does not start the map. **Settings → Diagnostics →
Copy report** copies a report on the device. FOSS Earth's
[diagnostics](https://github.com/foss-earth/ui/blob/main/docs/diagnostics.md)
and [app files](https://github.com/foss-earth/ui/blob/main/docs/app-files.md)
describe the mechanism, including how to attach a browser's inspector to a phone.
