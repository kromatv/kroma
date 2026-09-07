sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)
    scene = screen.CreateScene("KromaScene")
    screen.Show()
    if args <> invalid and args.server <> invalid and args.server <> "" then
        scene.launchServer = args.server
    end if
    scene.ready = true
    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent" then
            if msg.isScreenClosed() then return
        end if
    end while
end sub
