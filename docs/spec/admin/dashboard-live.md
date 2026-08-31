# Dashboard: what is playing, and what it is costing the wire

Status: **AGREED**

The top of the dashboard answers one question an owner asks from their phone: is anyone
watching, and is the server keeping up. Everything on this chapter is live by default and
becomes a historical record on demand, because those are two different questions and the
same chart can answer both.

## Now playing

Status: **SHIPPED**

**ADMIN-1** (SHIPPED) - The dashboard opens with every live playback session, newest first,
and refreshes without the owner reloading the page.

**ADMIN-2** (SHIPPED) - With nothing playing, the section says so in one sentence rather
than drawing an empty chart or hiding itself. An owner who sees no card must be able to
tell "nobody is watching" from "this panel is broken".

**ADMIN-3** (SHIPPED) - Each session names the viewer, the title, the position against the
duration, the device and player, the network class, and how the stream is being produced.

**ADMIN-4** (SHIPPED) - An owner with permission to manage users can end any session, and
is offered a message the viewer will see.

## The three resource charts share one shape

Status: **AGREED**

Bandwidth, processor and memory are the same plot over different series. They therefore
share one contract, and a reader who learns to read one has learned all three.

**ADMIN-5** (AGREED) - Every resource chart carries a **scope** control naming which series
are drawn, and a **range** control naming the window of time drawn. The two are
independent: changing one never resets the other.

**ADMIN-6** (AGREED) - Every resource chart carries a footer stating the mean of each series
over the window on screen, so a reader gets a number without hovering.

**ADMIN-7** (AGREED) - Hovering any point reveals every series' value at that instant,
labelled by how long ago it was.

**ADMIN-8** (AGREED) - The range control offers, in this order: live, the last 12 hours,
the last 24 hours, the last 7 days, the last 30 days, the last 90 days, the last year, and
everything the server has kept. Live is the default.

**ADMIN-9** (AGREED) - "Live" is the rolling in-memory window the server samples at its own
interval. Every other range is read from samples the server has persisted, so it survives a
restart. An owner asking what happened last Tuesday gets an answer.

**ADMIN-10** (AGREED) - A range with no stored samples says the server has not been running
long enough, rather than drawing a flat line at zero. A gap in the record is not a period of
inactivity and must never be drawn as one.

**ADMIN-11** (AGREED) - Persisted samples are downsampled as they age, so a year of history
costs a bounded amount of disk. The product promises the shape of the past, not every
sample of it.

## Bandwidth

Status: **SHIPPED**, ranges **AGREED**

**ADMIN-12** (SHIPPED) - The bandwidth chart draws two series, traffic to clients on the
local network and traffic to clients reached from outside it, because the second is the one
that costs the owner's uplink.

**ADMIN-13** (SHIPPED) - Bandwidth is measured from bytes the delivery handlers actually
put on the wire, not from a title's nominal bitrate. What the chart shows is what left the
machine.

**ADMIN-14** (AGREED) - The bandwidth scope control offers all traffic, local only, or
remote only.

**ADMIN-15** (AGREED) - The vertical scale is chosen from the data in the window and
labelled with its unit, so a quiet server does not draw a flat line against a scale sized
for a busy one.
