sub init()
    m.stack = m.top.findNode("stack")
    m.refresh = m.top.findNode("refresh")
    m.refresh.observeField("fire", "refreshSession")
    m.screens = []
    m.tasks = []
    m.accessToken = ""
    m.global.addFields({ server: "", token: "" })
end sub

sub onReady()
    session = sessionRead()
    if m.top.launchServer <> "" and m.top.launchServer <> session.server then
        session = { server: m.top.launchServer, accessToken: "" }
        sessionWrite(session.server, "")
    end if
    m.global.server = session.server
    m.accessToken = session.accessToken
    if session.server = "" or session.accessToken = "" then
        showPair()
    else
        refreshSession()
    end if
end sub

sub refreshSession()
    body = FormatJson({ accessToken: m.accessToken })
    m.tasks.push(apiRequest({ method: "POST", path: "/api/auth/token", body: body }, "onToken"))
end sub

sub onToken(event as object)
    reply = event.getData()
    if reply.status = 200 and reply.json <> invalid and reply.json.token <> invalid then
        m.global.token = reply.json.token
        if m.screens.count() = 0 then
            showHome()
            m.refresh.control = "start"
        end if
    else if reply.status = 401 or reply.status = 403 then
        m.refresh.control = "stop"
        m.global.token = ""
        sessionWrite(m.global.server, "")
        clearScreens()
        showPair()
    end if
end sub

sub showPair()
    screen = CreateObject("roSGNode", "PairScreen")
    screen.observeField("paired", "onPaired")
    push(screen)
end sub

sub onPaired(event as object)
    paired = event.getData()
    m.accessToken = paired.accessToken
    sessionWrite(m.global.server, paired.accessToken)
    m.global.token = paired.token
    clearScreens()
    showHome()
    m.refresh.control = "start"
end sub

sub showHome()
    screen = CreateObject("roSGNode", "HomeScreen")
    screen.observeField("selected", "onSelected")
    push(screen)
end sub

sub onSelected(event as object)
    target = event.getData()
    screen = CreateObject("roSGNode", "DetailScreen")
    screen.observeField("play", "onPlay")
    push(screen)
    screen.target = target
end sub

sub onPlay(event as object)
    screen = CreateObject("roSGNode", "PlayerScreen")
    screen.observeField("done", "onPlayerDone")
    push(screen)
    screen.play = event.getData()
end sub

sub onPlayerDone()
    pop()
end sub

sub push(screen as object)
    if m.screens.count() > 0 then m.screens.peek().visible = false
    m.stack.appendChild(screen)
    m.screens.push(screen)
    screen.setFocus(true)
end sub

sub pop()
    if m.screens.count() <= 1 then return
    top = m.screens.pop()
    top.active = false
    m.stack.removeChild(top)
    previous = m.screens.peek()
    previous.visible = true
    previous.setFocus(true)
end sub

sub clearScreens()
    while m.screens.count() > 0
        top = m.screens.pop()
        top.active = false
        m.stack.removeChild(top)
    end while
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if press and key = "back" and m.screens.count() > 1 then
        pop()
        return true
    end if
    return false
end function
