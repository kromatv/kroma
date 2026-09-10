sub init()
    m.top.functionName = "perform"
end sub

sub perform()
    transfer = CreateObject("roUrlTransfer")
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.RetainBodyOnError(true)
    transfer.SetUrl(m.top.server + m.top.path)
    transfer.AddHeader("Accept", "application/json")
    if m.top.token <> "" then transfer.AddHeader("Authorization", "Bearer " + m.top.token)
    if m.top.secret <> "" then transfer.AddHeader("X-Kroma-Pairing-Secret", m.top.secret)
    port = CreateObject("roMessagePort")
    transfer.SetMessagePort(port)
    if m.top.method = "GET" then
        started = transfer.AsyncGetToString()
    else
        transfer.SetRequest(m.top.method)
        transfer.AddHeader("Content-Type", "application/json")
        started = transfer.AsyncPostFromString(m.top.body)
    end if
    result = { tag: m.top.tag, status: 0, json: invalid }
    if started then
        message = wait(15000, port)
        if type(message) = "roUrlEvent" then
            result.status = message.GetResponseCode()
            text = message.GetString()
            if text <> "" then result.json = ParseJson(text)
        end if
    end if
    m.top.response = result
end sub
