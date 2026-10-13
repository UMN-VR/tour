# Reporting a tour bug

Open **Bug report** from **+**, or use the **🐞** button at the bottom left when
the toolbar has room. Describe the problem, review the
prepared report, download its `.txt` file, and open the GitHub issue draft. Attach
the downloaded file in GitHub, wait for the upload to finish, and submit. GitHub
handles sign-in. The tour remains a static site; there is no reporting service.

The shared report identifies the tour build and FOSS Earth commit, browser,
display and touch capabilities, actual renderer and GPU details, effective
settings, current scene and panorama, warnings, errors, retained activity, and
the previous visit. If the tour cannot start, add `?report` to its address to
recover the previous visit's report without starting the map.

Reports are prepared and downloaded locally. Review the editable preview for
details you do not want to share. The full report reaches GitHub when you attach
the file, and that attachment is immediately public in this public repository.
The issue is published when you submit it. The short draft context is sent to
GitHub when you open the draft.

The build files the issue on `UMN-VR/tour`, from `__REPOSITORY_SLUG__`. Give an
agent the resulting issue URL, or `UMN-VR/tour#123` with the actual issue
number. It can use the attached activity and build revisions to investigate the
app that ran. Tour content belongs here; shared renderer, panorama and shell
defects belong in FOSS Earth. The shared implementation and report fields are
described in
[FOSS Earth's bug-reporting documentation](../../../foss-earth/ui/docs/bug-reporting.md).
