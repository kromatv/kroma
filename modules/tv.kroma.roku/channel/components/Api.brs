function apiRequest(options as object, callback as string) as object
    task = CreateObject("roSGNode", "ApiTask")
    task.server = m.global.server
    task.token = m.global.token
    if options.method <> invalid then task.method = options.method
    if options.body <> invalid then task.body = options.body
    if options.secret <> invalid then task.secret = options.secret
    if options.tag <> invalid then task.tag = options.tag
    task.path = options.path
    task.observeField("response", callback)
    task.control = "RUN"
    return task
end function

function absoluteUrl(path as string) as string
    if Left(path, 1) = "/" then return m.global.server + path
    return path
end function

function formatClock(ms as integer) as string
    total = Int(ms / 1000)
    hours = Int(total / 3600)
    minutes = Int((total mod 3600) / 60)
    seconds = total mod 60
    text = ""
    if hours > 0 then text = hours.ToStr() + ":"
    if hours > 0 and minutes < 10 then text = text + "0"
    text = text + minutes.ToStr() + ":"
    if seconds < 10 then text = text + "0"
    return text + seconds.ToStr()
end function
