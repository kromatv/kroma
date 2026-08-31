# Dashboard: processor and memory

Status: **AGREED**

What the machine is spending, and how much of that is KROMA's doing. The distinction is
the whole point of these two charts: a NAS at 100% tells an owner nothing until they know
whether the media server or something else on the box is responsible.

The shared chart contract is [`dashboard-live.md`](dashboard-live.md): scope, range,
footer means, hover, and the ranges that read from persisted samples. This chapter states
only what is particular to the two resource charts.

## Processor

Status: **SHIPPED** for the live window, scope and ranges **AGREED**

**ADMIN-16** (AGREED) - The processor chart draws two series, what KROMA costs and what the
whole machine costs, on a scale of nought to a hundred percent of the host.

**ADMIN-17** (SHIPPED) - KROMA's figure is the whole process tree, the server and every
child it spawned. A transcode is a child ffmpeg, so a figure that counted only the server
process reported single digits while the machine was saturated, which is worse than no
figure at all.

**ADMIN-18** (AGREED) - The processor scope control offers both series, KROMA alone, or the
system alone.

**ADMIN-19** (SHIPPED) - A third series names the share of KROMA's own figure that is media
work, so a box at a hundred percent names its culprit rather than only its size.

## Memory

Status: **SHIPPED** for the live window, scope and ranges **AGREED**

**ADMIN-20** (AGREED) - The memory chart draws the same two series as the processor chart,
as a percentage of the host's total memory, so the two read the same way.

**ADMIN-21** (SHIPPED) - KROMA's memory is the resident set of the whole process tree, for
the reason given in ADMIN-17.

**ADMIN-22** (AGREED) - The memory scope control offers both series, KROMA alone, or the
system alone.

**ADMIN-23** (AGREED) - Each series keeps one colour for the life of the product. A reader
who learned that one hue means the system does not find it repainted on the next release,
and a series dropping out never shifts another series' colour.

## What these charts cost to draw

Status: **AGREED**

**ADMIN-24** (AGREED) - Sampling runs whether or not anyone is looking, because the history
has to exist before it is asked for. It must therefore stay cheap enough for the weakest
box the product supports, a four-thread NAS, to pay for it permanently without noticing.

**ADMIN-25** (AGREED) - The server states its own sample interval alongside the data, so a
client labels the time axis with the truth rather than a constant that can drift out of
step with the server.
