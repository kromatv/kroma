function sessionRead() as object
    section = CreateObject("roRegistrySection", "kroma")
    session = { server: "", accessToken: "" }
    if section.Exists("server") then session.server = section.Read("server")
    if section.Exists("accessToken") then session.accessToken = section.Read("accessToken")
    return session
end function

sub sessionWrite(server as string, accessToken as string)
    section = CreateObject("roRegistrySection", "kroma")
    section.Write("server", server)
    section.Write("accessToken", accessToken)
    section.Flush()
end sub
