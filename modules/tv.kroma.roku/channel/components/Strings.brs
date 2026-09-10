function t(key as string) as string
    if m.strings = invalid then m.strings = loadStrings()
    value = m.strings[key]
    if value = invalid then return key
    return value
end function

function loadStrings() as object
    strings = readCatalog("en")
    locale = LCase(Left(CreateObject("roDeviceInfo").GetCurrentLocale(), 2))
    if locale = "en" then return strings
    translated = readCatalog(locale)
    for each key in translated
        strings[key] = translated[key]
    end for
    return strings
end function

function readCatalog(locale as string) as object
    text = ReadAsciiFile("pkg:/locales/" + locale + ".json")
    if text = "" then return {}
    catalog = ParseJson(text)
    if catalog = invalid then return {}
    return catalog
end function
