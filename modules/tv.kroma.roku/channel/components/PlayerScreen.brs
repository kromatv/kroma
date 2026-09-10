sub init()
    m.video = m.top.findNode("video")
    m.video.observeField("state", "onState")
    m.video.observeField("position", "onPosition")
    m.top.observeField("focusedChild", "onFocusChange")
    m.tasks = []
    m.itemId = ""
    m.lastReported = -100
end sub

sub onPlay()
    play = m.top.play
    m.itemId = play.itemId
    content = CreateObject("roSGNode", "ContentNode")
    content.url = absoluteUrl(play.url)
    content.streamFormat = play.format
    content.title = play.title
    if play.resumeMs > 0 then content.bookmarkPosition = Int(play.resumeMs / 1000)
    m.video.content = content
    m.video.setFocus(true)
    m.video.control = "play"
end sub

sub onPosition()
    position = m.video.position
    if position - m.lastReported < 10 then return
    m.lastReported = position
    report(position)
end sub

sub report(position as float)
    if m.itemId = "" then return
    body = FormatJson({ positionMs: Int(position * 1000), durationMs: Int(m.video.duration * 1000) })
    m.tasks.push(apiRequest({ method: "PUT", path: "/api/progress/" + m.itemId, body: body }, "onReported"))
end sub

sub onReported(event as object)
end sub

sub onState()
    state = m.video.state
    if state = "finished" or state = "error" then
        report(m.video.position)
        m.top.done = true
    end if
end sub

sub onActive()
    if m.top.active then return
    report(m.video.position)
    m.video.control = "stop"
end sub

sub onFocusChange()
    if m.top.hasFocus() then m.video.setFocus(true)
end sub
