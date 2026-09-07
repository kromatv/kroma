sub init()
    m.rows = m.top.findNode("rows")
    m.status = m.top.findNode("status")
    m.rows.observeField("rowItemSelected", "onSelect")
    m.top.observeField("focusedChild", "onFocusChange")
    m.tasks = []
    load()
end sub

sub load()
    m.status.text = t("loading")
    m.tasks.push(apiRequest({ path: "/api/module/tv.kroma.roku/channel/home" }, "onHome"))
end sub

sub onHome(event as object)
    reply = event.getData()
    if reply.status <> 200 or reply.json = invalid or reply.json.rows = invalid then
        m.status.text = t("loadFailed")
        return
    end if
    content = CreateObject("roSGNode", "ContentNode")
    for each row in reply.json.rows
        rowNode = content.createChild("ContentNode")
        rowNode.title = row.title
        for each tile in row.tiles
            item = rowNode.createChild("ContentNode")
            item.title = tile.title
            item.shortDescriptionLine1 = tile.subtitle
            item.hdPosterUrl = absoluteUrl(tile.poster)
            item.addFields({ itemId: tile.id, kind: tile.kind, progress: tile.progress })
        end for
    end for
    m.rows.content = content
    m.status.text = ""
    m.rows.setFocus(true)
end sub

sub onSelect(event as object)
    index = event.getData()
    row = m.rows.content.getChild(index[0])
    if row = invalid then return
    item = row.getChild(index[1])
    if item = invalid then return
    m.top.selected = { id: item.itemId, kind: item.kind }
end sub

sub onFocusChange()
    if m.top.hasFocus() and m.rows.content <> invalid then m.rows.setFocus(true)
end sub
