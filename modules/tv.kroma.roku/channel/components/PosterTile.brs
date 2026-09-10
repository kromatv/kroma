sub init()
    m.frame = m.top.findNode("frame")
    m.poster = m.top.findNode("poster")
    m.track = m.top.findNode("track")
    m.bar = m.top.findNode("bar")
    m.title = m.top.findNode("title")
    m.subtitle = m.top.findNode("subtitle")
end sub

sub onContent()
    content = m.top.itemContent
    if content = invalid then return
    m.poster.uri = content.hdPosterUrl
    m.title.text = content.title
    m.subtitle.text = content.shortDescriptionLine1
    progress = 0
    if content.hasField("progress") then progress = content.progress
    m.track.visible = progress > 0
    m.bar.visible = progress > 0
    m.bar.width = 220 * progress
end sub

sub onFocus()
    m.frame.opacity = m.top.focusPercent
end sub
