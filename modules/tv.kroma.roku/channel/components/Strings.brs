function t(key as string) as string
    if m.strings = invalid then
        locale = CreateObject("roDeviceInfo").GetCurrentLocale()
        if Left(locale, 2) = "fr" then
            m.strings = frStrings()
        else
            m.strings = enStrings()
        end if
    end if
    value = m.strings[key]
    if value = invalid then return key
    return value
end function

function enStrings() as object
    return {
        pairTitle: "Pair this Roku",
        pairHint: "Open KROMA on your phone or in a browser, go to Quick Connect and enter this code.",
        pairServer: "Server",
        pairUnreachable: "Cannot reach the server at",
        loading: "Loading",
        loadFailed: "Could not load the library.",
        play: "Play",
        resumeAt: "Resume at",
        episodes: "Episodes",
        signedOut: "Session ended. Pair again."
    }
end function

function frStrings() as object
    return {
        pairTitle: "Associer ce Roku",
        pairHint: "Ouvrez KROMA sur votre téléphone ou dans un navigateur, allez dans Quick Connect et saisissez ce code.",
        pairServer: "Serveur",
        pairUnreachable: "Impossible de joindre le serveur à",
        loading: "Chargement",
        loadFailed: "Impossible de charger la bibliothèque.",
        play: "Lire",
        resumeAt: "Reprendre à",
        episodes: "Épisodes",
        signedOut: "Session terminée. Associez à nouveau."
    }
end function
