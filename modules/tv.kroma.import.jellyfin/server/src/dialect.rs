//! Every call this importer makes, as one table. A server that speaks the same
//! API under other paths or another authorization scheme is another [`Dialect`].

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Method {
    Get,
    Post,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Call {
    pub(crate) method: Method,
    pub(crate) path: &'static str,
}

impl Call {
    const fn get(path: &'static str) -> Self {
        Self {
            method: Method::Get,
            path,
        }
    }

    const fn post(path: &'static str) -> Self {
        Self {
            method: Method::Post,
            path,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Product {
    Is(&'static str),
    IsNot(&'static str),
}

impl Product {
    pub(crate) fn admits(self, named: &str) -> bool {
        match self {
            Self::Is(product) => named == product,
            Self::IsNot(product) => named != product,
        }
    }
}

/// One server family this importer reads: what it is called, how it says what
/// it is, and every call made to it.
pub struct Dialect {
    pub(crate) name: &'static str,
    pub(crate) product: Product,
    pub(crate) local_address: &'static str,
    pub(crate) scheme: &'static str,
    pub(crate) server: Call,
    pub(crate) sign_in: Call,
    pub(crate) whoami: Call,
    pub(crate) users: Call,
    pub(crate) libraries: Call,
    pub(crate) items: Call,
    pub(crate) counts: Call,
}

pub(crate) const JELLYFIN: Dialect = Dialect {
    name: "Jellyfin",
    product: Product::Is("Jellyfin Server"),
    local_address: "http://127.0.0.1:8096",
    scheme: "MediaBrowser",
    server: Call::get("/System/Info/Public"),
    sign_in: Call::post("/Users/AuthenticateByName"),
    whoami: Call::get("/Users/Me"),
    users: Call::get("/Users"),
    libraries: Call::get("/Library/VirtualFolders"),
    items: Call::get("/Items"),
    counts: Call::get("/Items/Counts"),
};

/// Emby, as `docs/reference/emby-api.md` reads its documentation.
pub const EMBY: Dialect = Dialect {
    name: "Emby",
    product: Product::IsNot("Jellyfin Server"),
    local_address: "http://127.0.0.1:8096",
    scheme: "Emby",
    server: Call::get("/emby/System/Info/Public"),
    sign_in: Call::post("/emby/Users/AuthenticateByName"),
    whoami: Call::get("/emby/System/Info"),
    users: Call::get("/emby/Users/Query"),
    libraries: Call::get("/emby/Library/VirtualFolders/Query"),
    items: Call::get("/emby/Items"),
    counts: Call::get("/emby/Items/Counts"),
};

#[cfg(test)]
impl Dialect {
    pub(crate) fn calls(&self) -> [Call; 7] {
        let Self {
            name: _,
            product: _,
            local_address: _,
            scheme: _,
            server,
            sign_in,
            whoami,
            users,
            libraries,
            items,
            counts,
        } = *self;
        [server, sign_in, whoami, users, libraries, items, counts]
    }
}

#[cfg(test)]
mod tests;
