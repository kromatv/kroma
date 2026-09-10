sub init()
    m.code = m.top.findNode("code")
    m.hint = m.top.findNode("hint")
    m.timer = m.top.findNode("poll")
    m.timer.observeField("fire", "onPoll")
    m.top.findNode("title").text = t("roku.channel.pairTitle")
    m.top.findNode("serverLabel").text = t("roku.channel.pairServer") + ": " + m.global.server
    m.tasks = []
    m.secret = ""
    initiate()
end sub

sub initiate()
    m.secret = ""
    m.hint.text = t("roku.channel.pairHint")
    m.code.text = "····"
    m.tasks.push(apiRequest({ method: "POST", path: "/api/auth/quickconnect/initiate", body: "{}" }, "onInitiated"))
end sub

sub onInitiated(event as object)
    reply = event.getData()
    if reply.status = 200 and reply.json <> invalid and reply.json.code <> invalid then
        m.secret = reply.json.secret
        m.code.text = reply.json.code
        m.timer.control = "start"
    else
        m.hint.text = t("roku.channel.pairUnreachable") + " " + m.global.server
        m.code.text = ""
    end if
end sub

sub onPoll()
    if m.secret = "" then return
    m.tasks.push(apiRequest({ path: "/api/auth/quickconnect/poll", secret: m.secret }, "onPolled"))
end sub

sub onPolled(event as object)
    reply = event.getData()
    if reply.json = invalid or reply.json.status = invalid then return
    if reply.json.status = "authorized" then
        m.timer.control = "stop"
        m.top.paired = { token: reply.json.token, accessToken: reply.json.accessToken }
    else if reply.json.status = "expired" then
        initiate()
    end if
end sub

sub onActive()
    if not m.top.active then m.timer.control = "stop"
end sub
