sub init()
    m.backdrop = m.top.findNode("backdrop")
    m.poster = m.top.findNode("poster")
    m.title = m.top.findNode("title")
    m.subtitle = m.top.findNode("subtitle")
    m.overview = m.top.findNode("overview")
    m.status = m.top.findNode("status")
    m.actions = m.top.findNode("actions")
    m.actions.observeField("itemSelected", "onAction")
    m.top.observeField("focusedChild", "onFocusChange")
    m.tasks = []
    m.detail = invalid
end sub

sub onTarget()
    target = m.top.target
    m.status.text = t("roku.channel.loading")
    path = "/api/module/tv.kroma.roku/channel/detail/" + target.kind + "/" + target.id
    m.tasks.push(apiRequest({ path: path, tag: "detail" }, "onDetail"))
end sub

sub onDetail(event as object)
    reply = event.getData()
    if reply.status <> 200 or reply.json = invalid then
        m.status.text = t("roku.channel.loadFailed")
        return
    end if
    if reply.tag = "episode" then
        if reply.json.play <> invalid then m.top.play = reply.json.play
        return
    end if
    m.detail = reply.json
    m.title.text = m.detail.title
    m.subtitle.text = m.detail.subtitle
    m.overview.text = m.detail.overview
    m.poster.uri = absoluteUrl(m.detail.poster)
    if m.detail.backdrop <> "" then m.backdrop.uri = m.detail.backdrop
    m.status.text = ""
    fillActions()
    m.actions.setFocus(true)
end sub

sub fillActions()
    content = CreateObject("roSGNode", "ContentNode")
    if m.detail.play <> invalid then
        label = t("roku.channel.play")
        if m.detail.play.resumeMs > 0 then
            label = t("roku.channel.resumeAt") + " " + formatClock(m.detail.play.resumeMs)
        end if
        if m.detail.kind = "show" then label = label + "  ·  " + m.detail.play.title
        content.createChild("ContentNode").title = label
    end if
    for each episode in m.detail.episodes
        content.createChild("ContentNode").title = episode.title
    end for
    m.actions.content = content
end sub

sub onAction(event as object)
    index = event.getData()
    if m.detail.play <> invalid then
        if index = 0 then
            m.top.play = m.detail.play
            return
        end if
        index = index - 1
    end if
    episode = m.detail.episodes[index]
    if episode = invalid then return
    path = "/api/module/tv.kroma.roku/channel/detail/episode/" + episode.id
    m.tasks.push(apiRequest({ path: path, tag: "episode" }, "onDetail"))
end sub

sub onFocusChange()
    if m.top.hasFocus() and m.actions.content <> invalid then m.actions.setFocus(true)
end sub
